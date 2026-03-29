from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from apps.email_campaigns.models import CampaignStatus


class ContactEntry(BaseModel):
    email: str
    name: Optional[str] = None
    variables: dict = {}


class CampaignCreate(BaseModel):
    name: str
    subject: str
    body_html: str
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    contacts: list[ContactEntry] = []
    model_app_id: Optional[str] = None
    model_slug: Optional[str] = None
    email_field: Optional[str] = None
    name_field: Optional[str] = None
    scheduled_at: Optional[datetime] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    contacts: Optional[list[ContactEntry]] = None
    model_app_id: Optional[str] = None
    model_slug: Optional[str] = None
    email_field: Optional[str] = None
    name_field: Optional[str] = None
    scheduled_at: Optional[datetime] = None


class CampaignResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    subject: str
    body_html: str
    from_name: Optional[str]
    from_email: Optional[str]
    contacts: list[ContactEntry]
    model_app_id: Optional[str]
    model_slug: Optional[str]
    email_field: Optional[str]
    name_field: Optional[str]
    status: CampaignStatus
    scheduled_at: Optional[datetime]
    sent_at: Optional[datetime]
    total_recipients: int
    sent_count: int
    failed_count: int
    created_at: datetime
    updated_at: datetime
