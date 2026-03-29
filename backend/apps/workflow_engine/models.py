from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class TriggerType(str, Enum):
    RECORD_EVENT = "record_event"
    APPROVAL_EVENT = "approval_event"
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"
    MANUAL = "manual"


class TriggerEvent(str, Enum):
    ON_CREATE = "on_create"
    ON_UPDATE = "on_update"
    ON_DELETE = "on_delete"
    ON_APPROVED = "on_approved"
    ON_REJECTED = "on_rejected"
    ON_FIELD_CHANGE = "on_field_change"


class StepType(str, Enum):
    CREATE_RECORD = "create_record"
    UPDATE_RECORD = "update_record"
    SEND_NOTIFICATION = "send_notification"
    TRIGGER_APPROVAL = "trigger_approval"
    WAIT_DELAY = "wait_delay"
    CONDITIONAL_BRANCH = "conditional_branch"
    LOOP = "loop"
    HTTP_REQUEST = "http_request"
    SUB_WORKFLOW = "sub_workflow"
    SET_VARIABLE = "set_variable"
    HUMAN_TASK = "human_task"
    SLACK_MESSAGE = "slack_message"
    WHATSAPP_SEND = "whatsapp_send"
    STRIPE_CREATE_PAYMENT = "stripe_create_payment"
    GOOGLE_SHEETS_APPEND = "google_sheets_append"
    SEND_EMAIL = "send_email"


class RetryConfig(BaseModel):
    max_attempts: int = 3
    backoff_multiplier: float = 2.0
    initial_delay_seconds: int = 5


class BranchCondition(BaseModel):
    condition: dict[str, Any]
    next_step_id: str
    label: str = ""


class WorkflowTrigger(BaseModel):
    type: TriggerType
    event: Optional[TriggerEvent] = None
    field_name: Optional[str] = None
    cron_expression: Optional[str] = None
    webhook_secret: Optional[str] = None


class WorkflowStep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    type: StepType
    config: dict[str, Any] = Field(default_factory=dict)
    next_step_id: Optional[str] = None
    branch_conditions: list[BranchCondition] = Field(default_factory=list)
    retry_config: RetryConfig = Field(default_factory=RetryConfig)
    order: int = 0


class Workflow(Document):
    name: str
    model_id: Optional[str] = None
    app_id: Optional[str] = None
    tenant_id: str
    trigger: WorkflowTrigger
    steps: list[WorkflowStep] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "workflows"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("model_id", 1), ("tenant_id", 1)]),
            IndexModel([("trigger.type", 1)]),
        ]


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepResult(BaseModel):
    step_id: str
    status: RunStatus = RunStatus.PENDING
    input_data: dict[str, Any] = Field(default_factory=dict)
    output_data: dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    attempt_count: int = 0


class WorkflowRun(Document):
    workflow_id: str
    tenant_id: str
    trigger_record_id: Optional[str] = None
    trigger_event: Optional[str] = None
    status: RunStatus = RunStatus.PENDING
    current_step_id: Optional[str] = None
    step_results: list[StepResult] = Field(default_factory=list)
    variables: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "workflow_runs"
        indexes = [
            IndexModel([("workflow_id", 1)]),
            IndexModel([("tenant_id", 1), ("status", 1)]),
            IndexModel([("tenant_id", 1), ("created_at", -1)]),  # for dashboard queries sorted by date
            IndexModel([("trigger_record_id", 1)]),
            IndexModel([("idempotency_key", 1)], sparse=True),
        ]
