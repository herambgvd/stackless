from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, Indexed
from pydantic import EmailStr, Field
from pymongo import IndexModel


class User(Document):
    email: Indexed(EmailStr, unique=True)  # type: ignore[valid-type]
    hashed_password: str
    full_name: str
    tenant_id: Optional[str] = None
    roles: list[str] = Field(default_factory=list)
    is_active: bool = True
    is_superuser: bool = False
    onboarding_completed: bool = False
    # ── 2FA fields ────────────────────────────────────────────────────────────
    totp_secret: Optional[str] = None        # pyotp TOTP secret (base32)
    totp_enabled: bool = False
    totp_backup_codes: list[str] = Field(default_factory=list)  # hashed backup codes
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("roles", 1)]),
        ]


class RefreshToken(Document):
    user_id: str
    token_hash: str
    expires_at: datetime
    revoked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "refresh_tokens"
        indexes = [
            IndexModel([("user_id", 1)]),
            IndexModel([("token_hash", 1)], unique=True),
            IndexModel([("expires_at", 1)], expireAfterSeconds=0),
        ]
