from __future__ import annotations

from typing import Optional

from apps.approval_engine.models import (
    ApprovalFlow,
    ApprovalRequest,
    ApprovalStage,
    ApproverConfig,
    RequestStatus,
)
from apps.approval_engine.repository import (
    create_flow,
    create_request,
    delete_flow,
    get_flow_by_id,
    get_pending_requests_for_user,
    get_request_by_id,
    get_requests_for_record,
    list_flows,
    list_requests,
    save_request,
    update_flow,
)
from apps.approval_engine.schemas import (
    ApprovalDecisionRequest,
    ApprovalFlowCreate,
    ApprovalFlowUpdate,
    ApprovalRequestCreate,
    ApproverInboxResponse,
)
from apps.approval_engine.state_machine import ApprovalStateMachine
from core.exceptions import NotFoundError
from core.websocket_manager import ws_manager

_state_machine = ApprovalStateMachine()


async def create_approval_flow(payload: ApprovalFlowCreate, tenant_id: str) -> ApprovalFlow:
    stages = [
        ApprovalStage(
            name=s.name,
            order=s.order,
            approvers=[ApproverConfig(type=a.type, value=a.value) for a in s.approvers],
            approval_mode=s.approval_mode,
            skip_condition=s.skip_condition,
            sla_hours=s.sla_hours,
            escalation_policy=s.escalation_policy,
            parallel_with_stage_ids=s.parallel_with_stage_ids,
        )
        for s in sorted(payload.stages, key=lambda x: x.order)
    ]
    return await create_flow(
        name=payload.name,
        model_id=payload.model_id,
        app_id=payload.app_id,
        tenant_id=tenant_id,
        stages=stages,
    )


async def update_approval_flow(flow_id: str, payload: ApprovalFlowUpdate, tenant_id: str) -> ApprovalFlow:
    flow = await get_flow_by_id(flow_id)
    if flow is None or flow.tenant_id != tenant_id:
        raise NotFoundError("ApprovalFlow", flow_id)

    kwargs: dict = {}
    if payload.name is not None:
        kwargs["name"] = payload.name
    if payload.is_active is not None:
        kwargs["is_active"] = payload.is_active
    if payload.stages is not None:
        kwargs["stages"] = [
            ApprovalStage(
                name=s.name,
                order=s.order,
                approvers=[ApproverConfig(type=a.type, value=a.value) for a in s.approvers],
                approval_mode=s.approval_mode,
                sla_hours=s.sla_hours,
                escalation_policy=s.escalation_policy,
                skip_condition=s.skip_condition,
                parallel_with_stage_ids=s.parallel_with_stage_ids,
            )
            for s in sorted(payload.stages, key=lambda x: x.order)
        ]
    return await update_flow(flow, **kwargs)


async def submit_for_approval(
    payload: ApprovalRequestCreate,
    tenant_id: str,
    submitted_by: str,
) -> ApprovalRequest:
    flow = await get_flow_by_id(payload.flow_id)
    if flow is None or flow.tenant_id != tenant_id:
        raise NotFoundError("ApprovalFlow", payload.flow_id)

    request = await create_request(
        flow_id=payload.flow_id,
        model_id=payload.model_id,
        record_id=payload.record_id,
        tenant_id=tenant_id,
        submitted_by=submitted_by,
        metadata=payload.metadata,
    )
    req = await _state_machine.submit(str(request.id))
    try:
        import asyncio
        asyncio.ensure_future(ws_manager.broadcast_approval_update(
            tenant_id=req.tenant_id,
            request_id=str(req.id),
            flow_id=str(req.flow_id),
            status=req.status,
            decided_by=None,
        ))
    except Exception:
        pass
    return req


async def make_decision(
    request_id: str,
    payload: ApprovalDecisionRequest,
    user_id: str,
) -> ApprovalRequest:
    req = await _state_machine.decide(
        request_id=request_id,
        user_id=user_id,
        action=payload.action,
        comment=payload.comment,
        delegated_to=payload.delegated_to,
    )
    try:
        import asyncio
        asyncio.ensure_future(ws_manager.broadcast_approval_update(
            tenant_id=req.tenant_id,
            request_id=str(req.id),
            flow_id=str(req.flow_id),
            status=req.status,
            decided_by=user_id,
        ))
    except Exception:
        pass
    return req


async def get_inbox(user_id: str, tenant_id: str) -> ApproverInboxResponse:
    from apps.approval_engine.schemas import ApprovalRequestResponse, StageDecisionResponse

    all_pending = await get_pending_requests_for_user(user_id, tenant_id)

    # Filter to those where the user can actually approve
    eligible = []
    for req in all_pending:
        flow = await get_flow_by_id(req.flow_id)
        if flow and await _state_machine.can_approve(req, user_id, flow):
            eligible.append(req)

    def _to_response(r: ApprovalRequest) -> ApprovalRequestResponse:
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

    return ApproverInboxResponse(
        requests=[_to_response(r) for r in eligible],
        total=len(eligible),
    )


async def get_approval_history(request_id: str) -> ApprovalRequest:
    req = await get_request_by_id(request_id)
    if req is None:
        raise NotFoundError("ApprovalRequest", request_id)
    return req


async def delegate_approval(request_id: str, delegated_to: str, user_id: str) -> ApprovalRequest:
    from apps.approval_engine.models import DecisionAction

    return await _state_machine.decide(
        request_id=request_id,
        user_id=user_id,
        action=DecisionAction.DELEGATE,
        delegated_to=delegated_to,
    )
