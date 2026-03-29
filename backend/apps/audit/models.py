from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class AuditLog(Document):
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    action: str  # "create" | "update" | "delete" | "submit" | "cancel" | "amend"
    user_id: Optional[str] = None
    changes: dict[str, Any] = Field(default_factory=dict)
    snapshot: Optional[dict[str, Any]] = None  # full record state BEFORE this change (for restore)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "record_audit_logs"
        indexes = [
            IndexModel([("tenant_id", 1), ("record_id", 1)]),
            IndexModel([("tenant_id", 1), ("model_slug", 1)]),
            IndexModel([("created_at", -1)]),
        ]
