from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class IntegrationProvider(str, Enum):
    SLACK = "slack"
    WHATSAPP = "whatsapp"
    STRIPE = "stripe"
    GOOGLE_SHEETS = "google_sheets"
    SMTP = "smtp"
    SENDGRID = "sendgrid"
    TWILIO = "twilio"
    GENERIC_WEBHOOK = "generic_webhook"


class CredentialType(str, Enum):
    API_KEY = "api_key"
    OAUTH2 = "oauth2"
    SMTP = "smtp"


class Integration(Document):
    """Tenant-scoped credential store for external service providers."""
    tenant_id: str
    name: str
    provider: IntegrationProvider
    credential_type: CredentialType
    # Credentials stored encrypted (base64 encoded JSON for now)
    credentials: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    last_used_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "integrations"
        indexes = [
            IndexModel([("tenant_id", 1), ("provider", 1)]),
            IndexModel([("tenant_id", 1), ("is_active", 1)]),
        ]
