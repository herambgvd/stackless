from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class InboxConfig(Document):
    """IMAP inbox configuration per tenant (one inbox per tenant for now)."""
    tenant_id: str
    imap_host: str
    imap_port: int = 993
    imap_username: str
    imap_password: str  # stored encrypted in production — plaintext here for MVP
    use_ssl: bool = True
    mailbox: str = "INBOX"
    # Link fetched emails to a model record (optional)
    linked_app_id: Optional[str] = None
    linked_model_slug: Optional[str] = None
    is_active: bool = True
    last_polled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "email_inbox_configs"
        indexes = [
            IndexModel([("tenant_id", 1)], unique=True),
        ]


class InboundEmail(Document):
    """A fetched inbound email stored in the database."""
    tenant_id: str
    message_id: str                  # IMAP Message-ID header — for deduplication
    subject: str = ""
    from_email: str = ""
    from_name: str = ""
    to_emails: list[str] = Field(default_factory=list)
    cc_emails: list[str] = Field(default_factory=list)
    body_text: str = ""
    body_html: str = ""
    attachments: list[dict] = Field(default_factory=list)  # {name, content_type, size}
    received_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    is_read: bool = False
    # Linked record (if auto-matched)
    linked_record_id: Optional[str] = None
    linked_model_slug: Optional[str] = None
    linked_app_id: Optional[str] = None

    class Settings:
        name = "inbound_emails"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("message_id", 1), ("tenant_id", 1)], unique=True),
            IndexModel([("received_at", -1)]),
            IndexModel([("from_email", 1)]),
            IndexModel([("is_read", 1)]),
        ]
