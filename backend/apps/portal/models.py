from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class PortalSubmission(Document):
    """Stores a submitted form response from the public portal."""

    app_id: str
    tenant_id: str
    model_slug: str | None = None      # which model was submitted to
    record_id: str | None = None       # ID of the created dynamic record
    data: dict[str, Any] = Field(default_factory=dict)
    status: str = "submitted"          # submitted | processing | completed | rejected
    submitted_by: str | None = None    # user_id if authenticated, None if anonymous
    ip_address: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "portal_submissions"
        indexes = [
            IndexModel([("app_id", 1), ("tenant_id", 1)]),
            IndexModel([("tenant_id", 1), ("status", 1)]),
            IndexModel([("created_at", -1)]),
        ]
