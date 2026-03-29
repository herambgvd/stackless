from __future__ import annotations

import asyncio
import structlog
from datetime import datetime, timezone

from celery_worker import celery_app

log = structlog.get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="apps.human_tasks.tasks.resume_workflow_after_human_task",
    queue="workflows",
)
def resume_workflow_after_human_task(run_id: str, step_id: str, submitted_data: dict):
    """Resume a paused workflow run after a human task is completed."""
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
            human_step = steps_by_id.get(step_id)
            if human_step is None:
                return

            # Mark the human_task step as completed with the submitted data
            completed_result = StepResult(
                step_id=step_id,
                status=RunStatus.COMPLETED,
                output_data={"submitted_data": submitted_data},
                started_at=datetime.now(tz=timezone.utc),
                completed_at=datetime.now(tz=timezone.utc),
            )
            await update_run_step_result(run, completed_result)

            # Merge submitted data into run variables
            run.variables.update(submitted_data)

            executor = WorkflowExecutor()
            context = dict(run.variables)

            # Continue from the step after the human task
            next_step_id = human_step.next_step_id
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

                # Another human task step encountered — pause again
                if step_result.output_data.get("status") == "waiting_for_human":
                    run.status = RunStatus.PENDING
                    await save_run(run)
                    return

                next_step_id = executor._resolve_next_step(current_step, step_result)
                current_step = steps_by_id.get(next_step_id) if next_step_id else None
            else:
                run.status = RunStatus.COMPLETED

            if run.status not in (RunStatus.FAILED, RunStatus.PENDING):
                run.status = RunStatus.COMPLETED

            run.completed_at = datetime.now(tz=timezone.utc)
            await save_run(run)

        _run_async(_run())
        log.info("Workflow resumed after human task", run_id=run_id, step_id=step_id)
    except Exception as exc:
        log.error("resume_workflow_after_human_task failed", exc_info=exc)


@celery_app.task(
    name="apps.human_tasks.tasks.expire_overdue_human_tasks",
    queue="default",
)
def expire_overdue_human_tasks():
    """Called by Celery Beat. Marks PENDING human tasks past their due_at as EXPIRED."""
    try:
        from core.database import init_db
        from apps.human_tasks.models import HumanTask, HumanTaskStatus

        async def _run():
            await init_db()
            now = datetime.now(tz=timezone.utc)
            overdue = await HumanTask.find(
                HumanTask.status == HumanTaskStatus.PENDING,
                HumanTask.due_at != None,  # noqa: E711
                HumanTask.due_at < now,
            ).to_list()
            for task in overdue:
                task.status = HumanTaskStatus.EXPIRED
                task.updated_at = now
                await task.save()
                log.info("Human task expired", task_id=str(task.id), workflow_run_id=task.workflow_run_id)
                # Fail the associated workflow run so it doesn't hang forever
                try:
                    from apps.workflow_engine.repository import get_run_by_id, save_run
                    from apps.workflow_engine.models import RunStatus
                    run = await get_run_by_id(task.workflow_run_id)
                    if run and run.status in (RunStatus.RUNNING, RunStatus.PENDING):
                        run.status = RunStatus.FAILED
                        run.error = f"Human task '{task.title}' expired past its due date."
                        run.completed_at = now
                        await save_run(run)
                except Exception:
                    pass

        _run_async(_run())
        log.info("expire_overdue_human_tasks completed")
    except Exception as exc:
        log.error("expire_overdue_human_tasks failed", exc_info=exc)
