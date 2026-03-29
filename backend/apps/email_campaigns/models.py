from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    SENT = "sent"
    CANCELLED = "cancelled"


class ContactListEntry(BaseModel):
    email: str
    name: Optional[str] = None
    variables: dict = Field(default_factory=dict)  # per-contact template vars


class EmailCampaign(Document):
    """A bulk email campaign (newsletter / announcement)."""
    tenant_id: str
    name: str
    subject: str
    body_html: str                     # Jinja2 — {{ name }}, {{ unsubscribe_url }}, etc.
    from_name: Optional[str] = None
    from_email: Optional[str] = None   # falls back to SMTP_FROM in settings

    # Audience — either a static list or a model-based query
    contacts: list[ContactListEntry] = Field(default_factory=list)  # static list
    # Model-based audience
    model_app_id: Optional[str] = None
    model_slug: Optional[str] = None
    email_field: Optional[str] = None  # field on the model that holds the email
    name_field: Optional[str] = None   # optional name field

    status: CampaignStatus = CampaignStatus.DRAFT
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None

    total_recipients: int = 0
    sent_count: int = 0
    failed_count: int = 0

    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "email_campaigns"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("status", 1)]),
            IndexModel([("scheduled_at", 1)]),
        ]


class CampaignSendLog(Document):
    """Per-recipient send record."""
    campaign_id: str
    tenant_id: str
    email: str
    name: Optional[str] = None
    status: str = "pending"   # pending | sent | failed | bounced
    error: Optional[str] = None
    sent_at: Optional[datetime] = None

    class Settings:
        name = "campaign_send_logs"
        indexes = [
            IndexModel([("campaign_id", 1)]),
            IndexModel([("tenant_id", 1), ("email", 1)]),
            IndexModel([("status", 1)]),
        ]
