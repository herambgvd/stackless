from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class RuleTrigger(str, Enum):
    ON_SAVE = "on_save"
    ON_CREATE = "on_create"
    ON_UPDATE = "on_update"
    ON_DELETE = "on_delete"


class RuleOperator(str, Enum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    GTE = "gte"
    LTE = "lte"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    IS_EMPTY = "is_empty"
    IS_NOT_EMPTY = "is_not_empty"
    IN_LIST = "in_list"
    NOT_IN_LIST = "not_in_list"
    REGEX_MATCH = "regex_match"
    CHANGED_TO = "changed_to"
    CHANGED_FROM = "changed_from"
    BETWEEN = "between"


class LogicGroup(str, Enum):
    AND = "AND"
    OR = "OR"


class RuleActionType(str, Enum):
    VALIDATE = "validate"
    COMPUTE = "compute"
    TRIGGER_APPROVAL = "trigger_approval"
    TRIGGER_WORKFLOW = "trigger_workflow"
    SET_FIELD = "set_field"
    SEND_NOTIFICATION = "send_notification"


class RuleCondition(BaseModel):
    field: str
    operator: RuleOperator
    value: Optional[Any] = None
    logic_group: LogicGroup = LogicGroup.AND
    nested_conditions: list["RuleCondition"] = Field(default_factory=list)


class RuleAction(BaseModel):
    type: RuleActionType
    config: dict[str, Any] = Field(default_factory=dict)


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    trigger: RuleTrigger
    priority: int = 0
    condition: RuleCondition
    action: RuleAction
    is_active: bool = True


class RuleSet(Document):
    name: str
    model_id: str
    app_id: str
    tenant_id: str
    rules: list[Rule] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "rule_sets"
        indexes = [
            IndexModel([("model_id", 1), ("tenant_id", 1)]),
            IndexModel([("app_id", 1)]),
        ]
