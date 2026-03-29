from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class ApprovalMode(str, Enum):
    ANY_ONE = "any_one"
    ALL = "all"
    MAJORITY = "majority"


class EscalationPolicy(str, Enum):
    AUTO_ESCALATE = "auto_escalate"
    AUTO_REJECT = "auto_reject"


class ApproverType(str, Enum):
    ROLE = "role"
    USER = "user"
    FIELD_REF = "field_ref"


class ApproverConfig(BaseModel):
    type: ApproverType
    value: str


class ApprovalStage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    order: int
    approvers: list[ApproverConfig]
    approval_mode: ApprovalMode = ApprovalMode.ANY_ONE
    skip_condition: Optional[dict] = None
    sla_hours: int = 48
    escalation_policy: EscalationPolicy = EscalationPolicy.AUTO_ESCALATE
    parallel_with_stage_ids: list[str] = Field(default_factory=list)


class ApprovalFlow(Document):
    name: str
    model_id: str
    app_id: str
    tenant_id: str
    stages: list[ApprovalStage] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "approval_flows"
        indexes = [
            IndexModel([("model_id", 1), ("tenant_id", 1)]),
            IndexModel([("tenant_id", 1)]),
        ]


class RequestStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    INFO_REQUESTED = "info_requested"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


class DecisionAction(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    DELEGATE = "delegate"
    REQUEST_INFO = "request_info"


class StageDecision(BaseModel):
    stage_id: str
    approver_id: str
    action: DecisionAction
    comment: Optional[str] = None
    decided_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    delegated_to: Optional[str] = None


class ApprovalRequest(Document):
    flow_id: str
    model_id: str
    record_id: str
    tenant_id: str
    current_stage_index: int = 0
    status: RequestStatus = RequestStatus.DRAFT
    stage_decisions: list[StageDecision] = Field(default_factory=list)
    submitted_by: str
    submitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    sla_deadline: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    # Optimistic-locking version counter — incremented atomically on every save.
    # Prevents two concurrent approvers from double-advancing the stage index.
    version: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "approval_requests"
        indexes = [
            IndexModel([("tenant_id", 1), ("status", 1)]),
            IndexModel([("record_id", 1)]),
            IndexModel([("flow_id", 1)]),
            IndexModel([("submitted_by", 1)]),
            IndexModel([("sla_deadline", 1)]),
        ]
