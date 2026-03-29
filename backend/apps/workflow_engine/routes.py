from __future__ import annotations

import hashlib
import hmac
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, Query, Request, status

from apps.workflow_engine.models import RunStatus
from apps.workflow_engine.repository import (
    delete_workflow,
    get_workflow_by_id,
    list_runs,
    list_workflows,
)
from apps.workflow_engine.schemas import (
    TriggerWorkflowRequest,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowRunResponse,
    WorkflowUpdate,
    StepResultResponse,
)
from apps.workflow_engine.service import (
    cancel_run,
    create_new_workflow,
    get_run_detail,
    trigger_workflow,
    update_existing_workflow,
    _run_to_response,
)
from apps.workflow_engine.repository import get_run_by_id, save_run
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError, ValidationError

router = APIRouter()


def _wf_to_response(wf) -> WorkflowResponse:
    return WorkflowResponse(
        id=str(wf.id),
        name=wf.name,
        model_id=wf.model_id,
        app_id=wf.app_id,
        tenant_id=wf.tenant_id,
        trigger=wf.trigger.model_dump(),
        steps=[s.model_dump() for s in wf.steps],
        is_active=wf.is_active,
        created_at=wf.created_at,
        updated_at=wf.updated_at,
    )


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows_endpoint(
    model_id: Optional[str] = None,
    app_id: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("workflows", "read")),
):
    workflows = await list_workflows(tenant_id, model_id=model_id, app_id=app_id)
    return [_wf_to_response(w) for w in workflows]


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_endpoint(
    payload: WorkflowCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("workflows", "create")),
):
    wf = await create_new_workflow(payload, tenant_id)
    return _wf_to_response(wf)


@router.get("/runs", response_model=list[WorkflowRunResponse])
async def list_runs_endpoint(
    workflow_id: Optional[str] = None,
    run_status: Optional[RunStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    skip = (page - 1) * page_size
    runs, _ = await list_runs(
        tenant_id=tenant_id,
        workflow_id=workflow_id,
        status=run_status,
        skip=skip,
        limit=page_size,
    )
    return [_run_to_response(r) for r in runs]


@router.get("/runs/{run_id}", response_model=WorkflowRunResponse)
async def get_run_endpoint(
    run_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    run = await get_run_detail(run_id, tenant_id)
    return _run_to_response(run)


@router.post("/runs/{run_id}/pause", status_code=200)
async def pause_workflow_run(
    run_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
    _=Depends(require_permission("workflows", "update")),
):
    """Pause a running workflow run."""
    run = await get_run_by_id(run_id)
    if not run or run.tenant_id != tenant_id:
        raise NotFoundError("WorkflowRun", run_id)
    if run.status not in (RunStatus.RUNNING, RunStatus.PENDING):
        raise ValidationError(f"Cannot pause a workflow run in '{run.status}' state")
    run.status = "paused"  # type: ignore[assignment]  — PAUSED not yet in RunStatus enum
    await save_run(run)
    return {"message": "Workflow paused", "run_id": run_id}


@router.post("/runs/{run_id}/resume", status_code=200)
async def resume_workflow_run(
    run_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
    _=Depends(require_permission("workflows", "update")),
):
    """Resume a paused workflow run."""
    from apps.workflow_engine.tasks import execute_workflow_task
    run = await get_run_by_id(run_id)
    if not run or run.tenant_id != tenant_id:
        raise NotFoundError("WorkflowRun", run_id)
    if run.status != "paused":  # type: ignore[comparison-overlap]
        raise ValidationError(f"Cannot resume a workflow run in '{run.status}' state")
    run.status = RunStatus.RUNNING
    await save_run(run)
    execute_workflow_task.delay(
        workflow_id=run.workflow_id,
        trigger_record_id=run.trigger_record_id,
        trigger_event=run.trigger_event,
        context=run.variables or {},
    )
    return {"message": "Workflow resumed", "run_id": run_id}


@router.post("/runs/{run_id}/cancel", response_model=WorkflowRunResponse)
async def cancel_run_endpoint(
    run_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    run = await cancel_run(run_id, tenant_id)
    return _run_to_response(run)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow_endpoint(
    workflow_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    wf = await get_workflow_by_id(workflow_id)
    if not wf or wf.tenant_id != tenant_id:
        raise NotFoundError("Workflow", workflow_id)
    return _wf_to_response(wf)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow_endpoint(
    workflow_id: str,
    payload: WorkflowUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("workflows", "update")),
):
    wf = await update_existing_workflow(workflow_id, payload, tenant_id)
    return _wf_to_response(wf)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow_endpoint(
    workflow_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("workflows", "delete")),
):
    wf = await get_workflow_by_id(workflow_id)
    if not wf or wf.tenant_id != tenant_id:
        raise NotFoundError("Workflow", workflow_id)
    deleted = await delete_workflow(workflow_id)
    if not deleted:
        raise NotFoundError("Workflow", workflow_id)


@router.post("/webhook/{webhook_token}", status_code=status.HTTP_202_ACCEPTED)
async def inbound_webhook_endpoint(
    webhook_token: str,
    request: Request,
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature"),
):
    """Public inbound webhook receiver.

    External systems POST to this URL to trigger a workflow.  The ``webhook_token``
    uniquely identifies a workflow (stored in ``trigger.webhook_secret``).

    Optional HMAC validation: if the workflow has a ``webhook_secret`` set and the
    caller sends ``X-Webhook-Signature: sha256=<hex>``, the signature is verified
    against the raw request body using the secret as the key.
    """
    import structlog
    log = structlog.get_logger(__name__)

    # Find workflow by webhook_token (stored in trigger.webhook_secret)
    from apps.workflow_engine.models import TriggerType, Workflow
    workflow = await Workflow.find_one(
        Workflow.trigger.type == TriggerType.WEBHOOK,
        Workflow.trigger.webhook_secret == webhook_token,
        Workflow.is_active == True,
    )
    if workflow is None:
        from core.exceptions import NotFoundError
        raise NotFoundError("Webhook", webhook_token)

    # Parse body — accept JSON or fall back to empty dict
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        body = {}

    # Optional HMAC signature verification
    if x_webhook_signature and webhook_token:
        raw_body = await request.body()
        expected_sig = hmac.HMAC(
            webhook_token.encode(), raw_body, hashlib.sha256
        ).hexdigest()
        caller_sig = x_webhook_signature.removeprefix("sha256=")
        if not hmac.compare_digest(expected_sig, caller_sig):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    # Dispatch workflow execution asynchronously
    from apps.workflow_engine.tasks import execute_workflow_task
    task = execute_workflow_task.delay(
        workflow_id=str(workflow.id),
        trigger_record_id=body.get("record_id"),
        trigger_event="webhook",
        context=body,
    )
    log.info(
        "Inbound webhook received, workflow queued",
        workflow_id=str(workflow.id),
        task_id=task.id,
    )
    return {"status": "accepted", "workflow_id": str(workflow.id), "task_id": task.id}


@router.post("/{workflow_id}/trigger", response_model=WorkflowRunResponse)
async def trigger_workflow_endpoint(
    workflow_id: str,
    payload: TriggerWorkflowRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("workflows", "create")),
):
    run = await trigger_workflow(workflow_id, payload.record_id, payload.context, tenant_id)
    return _run_to_response(run)
