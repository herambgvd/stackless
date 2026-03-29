from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from apps.workflow_engine.models import RunStatus, StepType, TriggerEvent, TriggerType


class WorkflowTriggerSchema(BaseModel):
    type: TriggerType
    event: Optional[TriggerEvent] = None
    field_name: Optional[str] = None
    cron_expression: Optional[str] = None
    webhook_secret: Optional[str] = None


class WorkflowStepSchema(BaseModel):
    name: str
    type: StepType
    config: dict[str, Any] = {}
    next_step_id: Optional[str] = None
    branch_conditions: list[dict] = []
    retry_config: dict = {}
    order: int = 0


class WorkflowCreate(BaseModel):
    name: str
    model_id: Optional[str] = None
    app_id: Optional[str] = None
    trigger: WorkflowTriggerSchema
    steps: list[WorkflowStepSchema] = []


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    trigger: Optional[WorkflowTriggerSchema] = None
    steps: Optional[list[WorkflowStepSchema]] = None
    is_active: Optional[bool] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    model_id: Optional[str]
    app_id: Optional[str]
    tenant_id: str
    trigger: dict
    steps: list[dict]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StepResultResponse(BaseModel):
    step_id: str
    status: RunStatus
    input_data: dict[str, Any]
    output_data: dict[str, Any]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    attempt_count: int


class WorkflowRunResponse(BaseModel):
    id: str
    workflow_id: str
    tenant_id: str
    trigger_record_id: Optional[str]
    trigger_event: Optional[str]
    status: RunStatus
    current_step_id: Optional[str]
    step_results: list[StepResultResponse]
    variables: dict[str, Any]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    created_at: datetime


class TriggerWorkflowRequest(BaseModel):
    record_id: Optional[str] = None
    context: dict[str, Any] = {}
