from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class RequestLog(Document):
    """Lightweight HTTP request log entry (sampled for admin observability)."""
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    method: str = ""
    path: str = ""
    status_code: int = 0
    duration_ms: float = 0.0
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    requested_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "request_logs"
        indexes = [
            IndexModel([("requested_at", -1)]),
            IndexModel([("tenant_id", 1), ("requested_at", -1)]),
            IndexModel([("status_code", 1)]),
        ]


class ErrorLog(Document):
    """Captures unhandled server errors for admin review."""
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    path: str = ""
    method: str = ""
    error_type: str = ""
    message: str = ""
    traceback: Optional[str] = None
    request_body: Optional[str] = None  # truncated JSON body
    status_code: int = 500
    resolved: bool = False
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "error_logs"
        indexes = [
            IndexModel([("occurred_at", -1)]),
            IndexModel([("tenant_id", 1), ("occurred_at", -1)]),
            IndexModel([("resolved", 1)]),
        ]
