from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class CommentCreate(BaseModel):
    content: str
    mentions: list[str] = Field(default_factory=list)  # user_ids to notify

    @field_validator("content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Comment cannot be empty")
        if len(v) > 5000:
            raise ValueError("Comment too long (max 5000 chars)")
        return v


class CommentUpdate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Comment cannot be empty")
        return v


class CommentResponse(BaseModel):
    id: str
    record_id: str
    user_id: str
    content: str
    mentions: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ActivityEntry(BaseModel):
    """Unified activity feed entry (comment or audit log event)."""
    id: str
    type: str                # "comment" | "change" | "create" | "delete"
    user_id: str
    content: str             # comment text OR human-readable change summary
    changes: dict | None     # field changes (audit only)
    created_at: datetime
