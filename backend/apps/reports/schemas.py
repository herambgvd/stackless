from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


class ScheduledReportCreate(BaseModel):
    name: str
    model_slug: str
    recipients: list[EmailStr]
    format: str = "csv"               # csv | pdf
    schedule: str = "daily"           # daily | weekly | monthly
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None

    @field_validator("recipients")
    @classmethod
    def at_least_one(cls, v):
        if not v:
            raise ValueError("At least one recipient required")
        if len(v) > 20:
            raise ValueError("Max 20 recipients")
        return v

    @field_validator("format")
    @classmethod
    def valid_format(cls, v):
        if v not in ("csv", "pdf"):
            raise ValueError("format must be csv or pdf")
        return v

    @field_validator("schedule")
    @classmethod
    def valid_schedule(cls, v):
        if v not in ("daily", "weekly", "monthly"):
            raise ValueError("schedule must be daily, weekly, or monthly")
        return v


class ScheduledReportUpdate(BaseModel):
    name: Optional[str] = None
    recipients: Optional[list[EmailStr]] = None
    format: Optional[str] = None
    schedule: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    is_active: Optional[bool] = None


class ScheduledReportResponse(BaseModel):
    id: str
    tenant_id: str
    app_id: str
    model_slug: str
    name: str
    recipients: list[str]
    format: str
    schedule: str
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    is_active: bool
    last_sent_at: Optional[datetime]
    created_by: str
    created_at: datetime
    updated_at: datetime
