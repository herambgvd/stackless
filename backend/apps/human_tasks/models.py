from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class HumanTaskStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class TaskFormField(BaseModel):
    name: str
    label: str
    type: str = "text"          # text | number | date | select | textarea | boolean
    required: bool = False
    options: list[str] = []
    placeholder: str = ""
    default_value: Any = None


class HumanTask(Document):
    """A task created by a HUMAN_TASK workflow step requiring user input."""

    workflow_run_id: str
    workflow_id: str
    step_id: str
    tenant_id: str
    assignee_id: Optional[str] = None
    assignee_role: Optional[str] = None
    title: str
    description: Optional[str] = None
    form_fields: list[TaskFormField] = Field(default_factory=list)
    submitted_data: dict[str, Any] = Field(default_factory=dict)
    status: HumanTaskStatus = HumanTaskStatus.PENDING
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "human_tasks"
        indexes = [
            IndexModel([("tenant_id", 1), ("status", 1)]),
            IndexModel([("assignee_id", 1), ("tenant_id", 1)]),
            IndexModel([("workflow_run_id", 1)]),
        ]
