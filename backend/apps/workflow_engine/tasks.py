from __future__ import annotations

import asyncio
from typing import Any, Optional

import structlog

from celery_worker import celery_app

log = structlog.get_logger(__name__)


def _run_async(coro):
    """Run an async coroutine in a Celery task (sync context)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="apps.workflow_engine.tasks.execute_workflow_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="workflows",
)
def execute_workflow_task(
    self,
    workflow_id: str,
    trigger_record_id: Optional[str],
    trigger_event: Optional[str],
    context: dict[str, Any],
    idempotency_key: Optional[str] = None,
):
    """Async Celery task that executes a workflow."""
    try:
        from core.database import init_db
        from apps.workflow_engine.executor import WorkflowExecutor

        async def _run():
            await init_db()
            executor = WorkflowExecutor()
            return await executor.execute_workflow(
                workflow_id=workflow_id,
                trigger_record_id=trigger_record_id,
                trigger_event=trigger_event,
                context=context,
                idempotency_key=idempotency_key,
            )

        run = _run_async(_run())
        log.info("Workflow task completed", workflow_id=workflow_id, run_id=str(run.id))
        return {"run_id": str(run.id), "status": run.status}

    except Exception as exc:
        log.error("Workflow task failed", exc_info=exc, workflow_id=workflow_id)
        raise self.retry(exc=exc)


@celery_app.task(
    name="apps.workflow_engine.tasks.execute_scheduled_workflows",
    queue="workflows",
)
def execute_scheduled_workflows():
    """Periodic task: fire all cron-triggered workflows whose schedule is due."""
    try:
        from core.database import init_db
        from apps.workflow_engine.repository import get_scheduled_workflows
        from croniter import croniter
        from datetime import datetime, timezone

        async def _run():
            await init_db()
            workflows = await get_scheduled_workflows()
            now = datetime.now(tz=timezone.utc)
            triggered = []
            for wf in workflows:
                expr = wf.trigger.cron_expression
                if expr and croniter.is_valid(expr):
                    cron = croniter(expr, now)
                    prev = cron.get_prev(datetime)
                    # If the previous occurrence was within the last minute, fire
                    if (now - prev).total_seconds() < 60:
                        execute_workflow_task.delay(
                            str(wf.id), None, "schedule", {}
                        )
                        triggered.append(str(wf.id))
            return triggered

        triggered = _run_async(_run())
        log.info("Scheduled workflows triggered", count=len(triggered))
        return {"triggered": triggered}
    except Exception as exc:
        log.error("Scheduled workflow task failed", exc_info=exc)


@celery_app.task(
    name="apps.workflow_engine.tasks.check_approval_sla_expiry",
    queue="workflows",
)
def check_approval_sla_expiry():
    """Periodic task: check approval SLA deadlines and escalate/expire."""
    try:
        from core.database import init_db
        from apps.approval_engine.state_machine import ApprovalStateMachine

        async def _run():
            await init_db()
            sm = ApprovalStateMachine()
            await sm.check_sla_expiry()

        _run_async(_run())
        log.info("Approval SLA expiry check completed")
    except Exception as exc:
        log.error("Approval SLA task failed", exc_info=exc)


@celery_app.task(
    name="apps.workflow_engine.tasks.execute_delayed_step",
    queue="workflows",
)
def execute_delayed_step(run_id: str, step_id: str):
    """Resume a workflow run after a wait/delay step's timer has elapsed.

    Marks the waited step as completed then continues sequential execution
    from the next step onward — same logic as the main executor loop.
    """
    try:
        from datetime import datetime, timezone
        from core.database import init_db
        from apps.workflow_engine.models import RunStatus, StepResult
        from apps.workflow_engine.repository import (
            get_run_by_id,
            get_workflow_by_id,
            save_run,
            update_run_step_result,
        )
        from apps.workflow_engine.executor import WorkflowExecutor

        async def _run():
            await init_db()
            run = await get_run_by_id(run_id)
            if run is None or run.status not in (RunStatus.RUNNING, RunStatus.PENDING):
                return

            workflow = await get_workflow_by_id(run.workflow_id)
            if workflow is None:
                return

            steps_by_id = {s.id: s for s in workflow.steps}
            waited_step = steps_by_id.get(step_id)
            if waited_step is None:
                return

            executor = WorkflowExecutor()
            context = dict(run.variables)

            # Mark the waited step as completed so the run log is accurate
            waited_result = StepResult(
                step_id=step_id,
                status=RunStatus.COMPLETED,
                output_data={"resumed": True},
                started_at=datetime.now(tz=timezone.utc),
                completed_at=datetime.now(tz=timezone.utc),
            )
            await update_run_step_result(run, waited_result)

            # Continue execution from the step immediately after the wait step
            next_step_id = waited_step.next_step_id
            current_step = steps_by_id.get(next_step_id) if next_step_id else None

            while current_step is not None:
                run.current_step_id = current_step.id
                await save_run(run)

                step_result = await executor._execute_step_with_retry(current_step, run, context)
                await update_run_step_result(run, step_result)

                if step_result.status == RunStatus.FAILED:
                    run.status = RunStatus.FAILED
                    run.error = step_result.error
                    break

                next_step_id = executor._resolve_next_step(current_step, step_result)
                current_step = steps_by_id.get(next_step_id) if next_step_id else None
            else:
                run.status = RunStatus.COMPLETED

            if run.status != RunStatus.FAILED:
                run.status = RunStatus.COMPLETED

            run.completed_at = datetime.now(tz=timezone.utc)
            await save_run(run)

        _run_async(_run())
        log.info("Delayed step resumed and workflow continued", run_id=run_id, step_id=step_id)
    except Exception as exc:
        log.error("Delayed step task failed", exc_info=exc)
