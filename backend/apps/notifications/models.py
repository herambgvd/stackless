from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class NotificationChannel(str, Enum):
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    IN_APP = "in_app"


class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationTemplate(Document):
    name: str
    slug: Optional[str] = None  # e.g. "user-invite", "password-reset" — used for lookup by type
    tenant_id: str  # use "global" for platform-wide fallback templates
    channel: NotificationChannel
    subject_template: str = ""
    body_template: str
    variables: list[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "notification_templates"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("channel", 1)]),
            IndexModel([("slug", 1), ("tenant_id", 1)]),
        ]


class EmailBounceEvent(Document):
    """Persisted record of an email bounce / delivery event from the SMTP provider webhook."""

    email: str
    event_type: str  # bounced | complained | unsubscribed | delivered | opened | clicked
    provider: str = "generic"  # sendgrid | mailgun | postmark | ses | generic
    provider_message_id: Optional[str] = None
    bounce_type: Optional[str] = None  # hard | soft | spam
    reason: Optional[str] = None
    raw_payload: dict = Field(default_factory=dict)
    received_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "email_bounce_events"
        indexes = [
            IndexModel([("email", 1)]),
            IndexModel([("event_type", 1)]),
            IndexModel([("received_at", -1)]),
        ]


class NotificationLog(Document):
    tenant_id: str
    channel: NotificationChannel
    recipient: str
    subject: str = ""
    template_id: Optional[str] = None
    status: NotificationStatus = NotificationStatus.PENDING
    is_read: bool = False
    sent_at: Optional[datetime] = None
    error: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "notification_logs"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("status", 1)]),
            IndexModel([("recipient", 1)]),
            IndexModel([("recipient", 1), ("channel", 1), ("is_read", 1)]),
        ]
