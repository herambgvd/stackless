from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query, status

from apps.approval_engine.models import ApprovalRequest, RequestStatus
from apps.approval_engine.repository import (
    delete_flow,
    get_flow_by_id,
    get_request_by_id,
    list_flows,
    list_requests,
)
from apps.approval_engine.schemas import (
    ApprovalDecisionRequest,
    ApprovalFlowCreate,
    ApprovalFlowResponse,
    ApprovalFlowUpdate,
    ApprovalRequestCreate,
    ApprovalRequestResponse,
    ApproverInboxResponse,
    StageDecisionResponse,
)
from apps.approval_engine.service import (
    create_approval_flow,
    get_approval_history,
    get_inbox,
    make_decision,
    submit_for_approval,
    update_approval_flow,
)
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import ForbiddenError, NotFoundError, ValidationError

router = APIRouter()


def _flow_to_response(flow) -> ApprovalFlowResponse:
    return ApprovalFlowResponse(
        id=str(flow.id),
        name=flow.name,
        model_id=flow.model_id,
        app_id=flow.app_id,
        tenant_id=flow.tenant_id,
        stages=[s.model_dump() for s in flow.stages],
        is_active=flow.is_active,
        created_at=flow.created_at,
        updated_at=flow.updated_at,
    )


def _request_to_response(r) -> ApprovalRequestResponse:
    return ApprovalRequestResponse(
        id=str(r.id),
        flow_id=r.flow_id,
        model_id=r.model_id,
        record_id=r.record_id,
        tenant_id=r.tenant_id,
        current_stage_index=r.current_stage_index,
        status=r.status,
        stage_decisions=[
            StageDecisionResponse(
                stage_id=d.stage_id,
                approver_id=d.approver_id,
                action=d.action,
                comment=d.comment,
                decided_at=d.decided_at,
                delegated_to=d.delegated_to,
            )
            for d in r.stage_decisions
        ],
        submitted_by=r.submitted_by,
        submitted_at=r.submitted_at,
        completed_at=r.completed_at,
        sla_deadline=r.sla_deadline,
        metadata=r.metadata,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


# ── Flows ──────────────────────────────────────────────────────────────────────

@router.get("/flows", response_model=list[ApprovalFlowResponse])
async def list_flows_endpoint(
    model_id: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    flows = await list_flows(tenant_id, model_id)
    return [_flow_to_response(f) for f in flows]


@router.post("/flows", response_model=ApprovalFlowResponse, status_code=status.HTTP_201_CREATED)
async def create_flow_endpoint(
    payload: ApprovalFlowCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("approvals", "create")),
):
    flow = await create_approval_flow(payload, tenant_id)
    return _flow_to_response(flow)


@router.get("/flows/{flow_id}", response_model=ApprovalFlowResponse)
async def get_flow_endpoint(
    flow_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    flow = await get_flow_by_id(flow_id)
    if not flow or flow.tenant_id != tenant_id:
        raise NotFoundError("ApprovalFlow", flow_id)
    return _flow_to_response(flow)


@router.put("/flows/{flow_id}", response_model=ApprovalFlowResponse)
async def update_flow_endpoint(
    flow_id: str,
    payload: ApprovalFlowUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("approvals", "update")),
):
    flow = await update_approval_flow(flow_id, payload, tenant_id)
    return _flow_to_response(flow)


@router.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flow_endpoint(
    flow_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("approvals", "delete")),
):
    flow = await get_flow_by_id(flow_id)
    if not flow or flow.tenant_id != tenant_id:
        raise NotFoundError("ApprovalFlow", flow_id)
    deleted = await delete_flow(flow_id)
    if not deleted:
        raise NotFoundError("ApprovalFlow", flow_id)


# ── Requests ───────────────────────────────────────────────────────────────────

@router.post("/requests", response_model=ApprovalRequestResponse, status_code=status.HTTP_201_CREATED)
async def submit_request_endpoint(
    payload: ApprovalRequestCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    request = await submit_for_approval(payload, tenant_id, str(current_user.id))
    return _request_to_response(request)


@router.get("/requests", response_model=list[ApprovalRequestResponse])
async def list_requests_endpoint(
    status_filter: Optional[RequestStatus] = Query(None, alias="status"),
    model_id: Optional[str] = None,
    record_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    skip = (page - 1) * page_size
    requests, _ = await list_requests(
        tenant_id=tenant_id,
        status=status_filter,
        model_id=model_id,
        record_id=record_id,
        skip=skip,
        limit=page_size,
    )
    return [_request_to_response(r) for r in requests]


@router.get("/requests/{request_id}", response_model=ApprovalRequestResponse)
async def get_request_endpoint(
    request_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    req = await get_request_by_id(request_id)
    if not req or req.tenant_id != tenant_id:
        raise NotFoundError("ApprovalRequest", request_id)
    return _request_to_response(req)


@router.post("/requests/{request_id}/decide", response_model=ApprovalRequestResponse)
async def decide_endpoint(
    request_id: str,
    payload: ApprovalDecisionRequest,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    req = await get_request_by_id(request_id)
    if not req or req.tenant_id != tenant_id:
        raise NotFoundError("ApprovalRequest", request_id)
    req = await make_decision(request_id, payload, str(current_user.id))
    return _request_to_response(req)


@router.get("/inbox", response_model=ApproverInboxResponse)
async def inbox_endpoint(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    return await get_inbox(str(current_user.id), tenant_id)


@router.post("/requests/{request_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_approval_request(
    request_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Cancel/withdraw a pending approval request. Only the submitter or a superuser can cancel."""
    try:
        oid = PydanticObjectId(request_id)
    except Exception:
        raise NotFoundError("ApprovalRequest", request_id)
    req = await ApprovalRequest.get(oid)
    if not req or req.tenant_id != tenant_id:
        raise NotFoundError("ApprovalRequest", request_id)
    if req.submitted_by != str(current_user.id) and not current_user.is_superuser:
        raise ForbiddenError("Only the submitter can cancel this request.")
    if req.status not in (RequestStatus.PENDING, RequestStatus.DRAFT):
        raise ValidationError(f"Cannot cancel a request in '{req.status}' state")
    req.status = RequestStatus.WITHDRAWN
    req.updated_at = datetime.now(tz=timezone.utc)
    await req.save()
    return {"message": "Approval request cancelled", "request_id": request_id}


@router.get("/requests/{request_id}/history", response_model=ApprovalRequestResponse)
async def request_history_endpoint(
    request_id: str,
    _=Depends(get_current_active_user),
):
    req = await get_approval_history(request_id)
    return _request_to_response(req)
