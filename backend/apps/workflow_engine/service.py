from __future__ import annotations

from typing import Any, Optional

from apps.workflow_engine.models import (
    BranchCondition,
    RetryConfig,
    RunStatus,
    Workflow,
    WorkflowRun,
    WorkflowStep,
    WorkflowTrigger,
)
from apps.workflow_engine.repository import (
    create_workflow,
    delete_workflow,
    get_run_by_id,
    get_workflow_by_id,
    list_runs,
    list_workflows,
    save_run,
    update_workflow,
)
from apps.workflow_engine.schemas import (
    WorkflowCreate,
    WorkflowRunResponse,
    WorkflowUpdate,
    StepResultResponse,
)
from core.exceptions import NotFoundError
from core.websocket_manager import ws_manager


async def create_new_workflow(payload: WorkflowCreate, tenant_id: str) -> Workflow:
    steps = [
        WorkflowStep(
            name=s.name,
            type=s.type,
            config=s.config,
            next_step_id=s.next_step_id,
            branch_conditions=[BranchCondition(**b) for b in s.branch_conditions],
            retry_config=RetryConfig(**s.retry_config) if s.retry_config else RetryConfig(),
            order=s.order,
        )
        for s in payload.steps
    ]
    return await create_workflow(
        name=payload.name,
        tenant_id=tenant_id,
        trigger=payload.trigger.model_dump(),
        steps=steps,
        model_id=payload.model_id,
        app_id=payload.app_id,
    )


async def update_existing_workflow(
    workflow_id: str,
    payload: WorkflowUpdate,
    tenant_id: str,
) -> Workflow:
    wf = await get_workflow_by_id(workflow_id)
    if wf is None or wf.tenant_id != tenant_id:
        raise NotFoundError("Workflow", workflow_id)

    kwargs: dict = {}
    if payload.name is not None:
        kwargs["name"] = payload.name
    if payload.is_active is not None:
        kwargs["is_active"] = payload.is_active
    if payload.trigger is not None:
        kwargs["trigger"] = WorkflowTrigger(**payload.trigger.model_dump())
    if payload.steps is not None:
        kwargs["steps"] = [
            WorkflowStep(
                name=s.name,
                type=s.type,
                config=s.config,
                next_step_id=s.next_step_id,
                branch_conditions=[BranchCondition(**b) for b in s.branch_conditions],
                retry_config=RetryConfig(**s.retry_config) if s.retry_config else RetryConfig(),
                order=s.order,
            )
            for s in payload.steps
        ]
    return await update_workflow(wf, **kwargs)


async def trigger_workflow(
    workflow_id: str,
    record_id: Optional[str],
    context: dict[str, Any],
    tenant_id: str,
) -> WorkflowRun:
    from apps.workflow_engine.tasks import execute_workflow_task

    wf = await get_workflow_by_id(workflow_id)
    if wf is None or wf.tenant_id != tenant_id:
        raise NotFoundError("Workflow", workflow_id)

    # Fire async via Celery
    execute_workflow_task.delay(
        workflow_id=workflow_id,
        trigger_record_id=record_id,
        trigger_event="manual",
        context=context,
    )

    # Return a placeholder run to acknowledge the trigger
    from apps.workflow_engine.repository import create_run

    run = await create_run(
        workflow_id=workflow_id,
        tenant_id=tenant_id,
        trigger_record_id=record_id,
        trigger_event="manual",
        variables=context,
    )
    try:
        import asyncio
        asyncio.ensure_future(ws_manager.broadcast_workflow_update(
            tenant_id=run.tenant_id,
            run_id=str(run.id),
            status=run.status,
            workflow_id=str(run.workflow_id),
        ))
    except Exception:
        pass  # Never let broadcast errors affect the workflow
    return run


async def cancel_run(run_id: str, tenant_id: str) -> WorkflowRun:
    run = await get_run_by_id(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise NotFoundError("WorkflowRun", run_id)
    run.status = RunStatus.CANCELLED
    from datetime import datetime, timezone
    run.completed_at = datetime.now(tz=timezone.utc)
    saved = await save_run(run)
    try:
        import asyncio
        asyncio.ensure_future(ws_manager.broadcast_workflow_update(
            tenant_id=saved.tenant_id,
            run_id=str(saved.id),
            status=saved.status,
            workflow_id=str(saved.workflow_id),
        ))
    except Exception:
        pass  # Never let broadcast errors affect the workflow
    return saved


async def get_run_detail(run_id: str, tenant_id: str) -> WorkflowRun:
    run = await get_run_by_id(run_id)
    if run is None or run.tenant_id != tenant_id:
        raise NotFoundError("WorkflowRun", run_id)
    return run


def _run_to_response(run: WorkflowRun) -> WorkflowRunResponse:
    return WorkflowRunResponse(
        id=str(run.id),
        workflow_id=run.workflow_id,
        tenant_id=run.tenant_id,
        trigger_record_id=run.trigger_record_id,
        trigger_event=run.trigger_event,
        status=run.status,
        current_step_id=run.current_step_id,
        step_results=[
            StepResultResponse(
                step_id=sr.step_id,
                status=sr.status,
                input_data=sr.input_data,
                output_data=sr.output_data,
                started_at=sr.started_at,
                completed_at=sr.completed_at,
                error=sr.error,
                attempt_count=sr.attempt_count,
            )
            for sr in run.step_results
        ],
        variables=run.variables,
        started_at=run.started_at,
        completed_at=run.completed_at,
        error=run.error,
        created_at=run.created_at,
    )
