from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from apps.notifications.models import NotificationChannel, NotificationStatus


class TemplateCreate(BaseModel):
    name: str
    channel: NotificationChannel
    subject_template: str = ""
    body_template: str
    variables: list[str] = []


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    variables: Optional[list[str]] = None
    is_active: Optional[bool] = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    tenant_id: str
    channel: NotificationChannel
    subject_template: str
    body_template: str
    variables: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SendNotificationRequest(BaseModel):
    channel: NotificationChannel
    recipient: str
    template_id: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    context: dict[str, Any] = {}


class NotificationLogResponse(BaseModel):
    id: str
    tenant_id: str
    channel: NotificationChannel
    recipient: str
    subject: str = ""
    template_id: Optional[str]
    status: NotificationStatus
    is_read: bool = False
    sent_at: Optional[datetime]
    error: Optional[str]
    payload: dict
    created_at: datetime


class InboxNotificationResponse(BaseModel):
    id: str
    subject: str
    body: str
    is_read: bool
    created_at: datetime
