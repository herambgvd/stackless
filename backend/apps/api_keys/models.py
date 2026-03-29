from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from beanie import Document


class ApiKey(Document):
    tenant_id: str
    user_id: str                      # who created this key
    name: str                         # human-readable label
    key_hash: str                     # SHA-256 hex of the raw key
    key_prefix: str                   # first 16 chars of raw key (for display)
    scopes: list[str] = ["read"]      # ["read"] | ["read", "write"] | ["admin"]
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = None
    updated_at: datetime = None

    def __init__(self, **data):
        if data.get("created_at") is None:
            data["created_at"] = datetime.now(tz=timezone.utc)
        if data.get("updated_at") is None:
            data["updated_at"] = datetime.now(tz=timezone.utc)
        super().__init__(**data)

    class Settings:
        name = "api_keys"
        indexes = [
            [("key_hash", 1)],           # primary lookup
            [("tenant_id", 1)],
            [("user_id", 1), ("tenant_id", 1)],
        ]
