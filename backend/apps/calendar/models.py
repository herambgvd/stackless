from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class CalendarEvent(Document):
    """A shared calendar event visible across the tenant."""

    tenant_id: str
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    color: str = "#6366f1"          # hex — defaults to indigo
    location: Optional[str] = None
    creator_id: str
    creator_name: str
    attendee_ids: list[str] = Field(default_factory=list)
    # Optional soft-link to a record
    record_app_id: Optional[str] = None
    record_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "calendar_events"
        indexes = [
            IndexModel([("tenant_id", 1), ("start_at", 1)]),
            IndexModel([("tenant_id", 1), ("end_at", 1)]),
            IndexModel([("creator_id", 1), ("tenant_id", 1)]),
        ]
