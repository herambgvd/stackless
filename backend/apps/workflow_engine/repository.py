from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.workflow_engine.models import (
    RunStatus,
    StepResult,
    TriggerEvent,
    TriggerType,
    Workflow,
    WorkflowRun,
)


async def get_workflow_by_id(workflow_id: str) -> Optional[Workflow]:
    try:
        oid = PydanticObjectId(workflow_id)
    except Exception:
        return None
    return await Workflow.get(oid)


async def list_workflows(tenant_id: str, model_id: Optional[str] = None, app_id: Optional[str] = None) -> list[Workflow]:
    filters = [Workflow.tenant_id == tenant_id]
    if model_id:
        filters.append(Workflow.model_id == model_id)
    if app_id:
        filters.append(Workflow.app_id == app_id)
    return await Workflow.find(*filters).to_list()


async def create_workflow(
    *,
    name: str,
    tenant_id: str,
    trigger: dict,
    steps: list,
    model_id: Optional[str] = None,
    app_id: Optional[str] = None,
) -> Workflow:
    from apps.workflow_engine.models import WorkflowTrigger, WorkflowStep

    wf = Workflow(
        name=name,
        tenant_id=tenant_id,
        model_id=model_id,
        app_id=app_id,
        trigger=WorkflowTrigger(**trigger),
        steps=steps,
    )
    await wf.insert()
    return wf


async def update_workflow(workflow: Workflow, **kwargs) -> Workflow:
    for key, value in kwargs.items():
        if hasattr(workflow, key):
            setattr(workflow, key, value)
    workflow.updated_at = datetime.now(tz=timezone.utc)
    await workflow.save()
    return workflow


async def delete_workflow(workflow_id: str) -> bool:
    wf = await get_workflow_by_id(workflow_id)
    if wf is None:
        return False
    await wf.delete()
    return True


async def get_active_workflows_for_model_and_event(
    model_id: str,
    tenant_id: str,
    event: str,
) -> list[Workflow]:
    return await Workflow.find(
        Workflow.model_id == model_id,
        Workflow.tenant_id == tenant_id,
        Workflow.is_active == True,
    ).to_list()


async def get_approval_event_workflows(tenant_id: str, event: str) -> list[Workflow]:
    """Return active workflows triggered by an approval event (on_approved / on_rejected)."""
    return await Workflow.find(
        Workflow.tenant_id == tenant_id,
        Workflow.is_active == True,
        Workflow.trigger.type == TriggerType.APPROVAL_EVENT,
        Workflow.trigger.event == event,
    ).to_list()


async def get_scheduled_workflows() -> list[Workflow]:
    return await Workflow.find(
        Workflow.is_active == True,
        Workflow.trigger.type == TriggerType.SCHEDULE,
    ).to_list()


async def create_run(
    *,
    workflow_id: str,
    tenant_id: str,
    trigger_record_id: Optional[str] = None,
    trigger_event: Optional[str] = None,
    variables: dict | None = None,
    idempotency_key: Optional[str] = None,
) -> WorkflowRun:
    run = WorkflowRun(
        workflow_id=workflow_id,
        tenant_id=tenant_id,
        trigger_record_id=trigger_record_id,
        trigger_event=trigger_event,
        variables=variables or {},
        idempotency_key=idempotency_key,
        started_at=datetime.now(tz=timezone.utc),
        status=RunStatus.RUNNING,
    )
    await run.insert()
    return run


async def save_run(run: WorkflowRun) -> WorkflowRun:
    await run.save()
    return run


async def get_run_by_id(run_id: str) -> Optional[WorkflowRun]:
    try:
        oid = PydanticObjectId(run_id)
    except Exception:
        return None
    return await WorkflowRun.get(oid)


async def list_runs(
    tenant_id: str,
    workflow_id: Optional[str] = None,
    status: Optional[RunStatus] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[WorkflowRun], int]:
    filters = [WorkflowRun.tenant_id == tenant_id]
    if workflow_id:
        filters.append(WorkflowRun.workflow_id == workflow_id)
    if status:
        filters.append(WorkflowRun.status == status)
    query = WorkflowRun.find(*filters)
    total = await query.count()
    items = await query.skip(skip).limit(limit).to_list()
    return items, total


async def update_run_step_result(run: WorkflowRun, step_result: StepResult) -> None:
    for i, sr in enumerate(run.step_results):
        if sr.step_id == step_result.step_id:
            run.step_results[i] = step_result
            await run.save()
            return
    run.step_results.append(step_result)
    await run.save()
