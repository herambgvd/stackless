from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from apps.approval_engine.models import (
    ApprovalMode,
    ApproverType,
    DecisionAction,
    EscalationPolicy,
    RequestStatus,
)


class ApproverConfigSchema(BaseModel):
    type: ApproverType
    value: str


class ApprovalStageSchema(BaseModel):
    name: str
    order: int
    approvers: list[ApproverConfigSchema]
    approval_mode: ApprovalMode = ApprovalMode.ANY_ONE
    skip_condition: Optional[dict] = None
    sla_hours: int = 48
    escalation_policy: EscalationPolicy = EscalationPolicy.AUTO_ESCALATE
    parallel_with_stage_ids: list[str] = []


class ApprovalFlowCreate(BaseModel):
    name: str
    model_id: str
    app_id: str
    stages: list[ApprovalStageSchema]


class ApprovalFlowUpdate(BaseModel):
    name: Optional[str] = None
    stages: Optional[list[ApprovalStageSchema]] = None
    is_active: Optional[bool] = None


class ApprovalFlowResponse(BaseModel):
    id: str
    name: str
    model_id: str
    app_id: str
    tenant_id: str
    stages: list[dict]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ApprovalRequestCreate(BaseModel):
    flow_id: str
    model_id: str
    record_id: str
    metadata: dict[str, Any] = {}


class ApprovalDecisionRequest(BaseModel):
    action: DecisionAction
    comment: Optional[str] = None
    delegated_to: Optional[str] = None


class StageDecisionResponse(BaseModel):
    stage_id: str
    approver_id: str
    action: DecisionAction
    comment: Optional[str]
    decided_at: datetime
    delegated_to: Optional[str]


class ApprovalRequestResponse(BaseModel):
    id: str
    flow_id: str
    model_id: str
    record_id: str
    tenant_id: str
    current_stage_index: int
    status: RequestStatus
    stage_decisions: list[StageDecisionResponse]
    submitted_by: str
    submitted_at: Optional[datetime]
    completed_at: Optional[datetime]
    sla_deadline: Optional[datetime]
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ApproverInboxResponse(BaseModel):
    requests: list[ApprovalRequestResponse]
    total: int
