from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from beanie import Document
from pydantic import Field


class Comment(Document):
    tenant_id: str
    record_id: str
    model_slug: str
    app_id: str
    user_id: str
    content: str                      # plain text with optional @{user_id} mentions
    mentions: list[str] = Field(default_factory=list)  # mentioned user_ids
    created_at: datetime = None
    updated_at: datetime = None
    is_deleted: bool = False          # soft-delete

    def __init__(self, **data):
        if data.get("created_at") is None:
            data["created_at"] = datetime.now(tz=timezone.utc)
        if data.get("updated_at") is None:
            data["updated_at"] = datetime.now(tz=timezone.utc)
        super().__init__(**data)

    class Settings:
        name = "comments"
        indexes = [
            [("record_id", 1), ("tenant_id", 1)],
            [("app_id", 1), ("model_slug", 1)],
        ]
