from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from apps.rules_engine.models import RuleActionType, RuleOperator, RuleTrigger


class RuleConditionSchema(BaseModel):
    field: str
    operator: RuleOperator
    value: Optional[Any] = None
    logic_group: str = "AND"
    nested_conditions: list["RuleConditionSchema"] = []


class RuleActionSchema(BaseModel):
    type: RuleActionType
    config: dict[str, Any] = {}


class RuleCreate(BaseModel):
    name: str
    trigger: RuleTrigger
    priority: int = 0
    condition: RuleConditionSchema
    action: RuleActionSchema
    is_active: bool = True


class RuleSetCreate(BaseModel):
    name: str
    model_id: str
    app_id: str
    rules: list[RuleCreate] = []


class RuleSetUpdate(BaseModel):
    name: Optional[str] = None
    rules: Optional[list[RuleCreate]] = None
    is_active: Optional[bool] = None


class RuleSetResponse(BaseModel):
    id: str
    name: str
    model_id: str
    app_id: str
    tenant_id: str
    rules: list[dict]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluateRequest(BaseModel):
    model_id: str
    app_id: str
    trigger: RuleTrigger
    record_data: dict[str, Any]
    previous_data: Optional[dict[str, Any]] = None


class RuleEvaluationResult(BaseModel):
    rule_id: str
    rule_name: str
    passed: bool
    error: Optional[str] = None
    computed_values: dict[str, Any] = {}
    triggered_actions: list[str] = []


class EvaluateResponse(BaseModel):
    passed_rules: list[RuleEvaluationResult]
    failed_rules: list[RuleEvaluationResult]
    errors: list[str]
    computed_values: dict[str, Any]
    triggered_actions: list[str]
