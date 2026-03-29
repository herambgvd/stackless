from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class InboundWebhook(Document):
    """Inbound webhook token — allows external systems to POST data to create records.

    POST /api/v1/webhooks/inbound/{token}
    Body: JSON object — fields are mapped via field_map before record creation.
    """
    token: str                             # secret random token (URL key)
    app_id: str
    model_slug: str
    tenant_id: str
    is_active: bool = True
    label: str = ""                        # human-readable description
    # Optional field mapping: {incoming_json_key: record_field_name}
    # If empty, the raw payload is used as-is.
    field_map: dict[str, str] = Field(default_factory=dict)
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    last_triggered_at: Optional[datetime] = None
    trigger_count: int = 0

    class Settings:
        name = "inbound_webhooks"
        indexes = [
            IndexModel([("token", 1)], unique=True),
            IndexModel([("tenant_id", 1), ("app_id", 1)]),
        ]
