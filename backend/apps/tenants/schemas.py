from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from apps.tenants.models import TenantPlan


class TenantBranding(BaseModel):
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    domain: Optional[str] = None
    favicon_url: Optional[str] = None


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")
    plan: TenantPlan = TenantPlan.FREE
    # Org Admin details (required when Super Admin creates a tenant)
    admin_email: Optional[str] = None
    admin_name: Optional[str] = None
    admin_password: Optional[str] = Field(None, min_length=8)


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    plan: Optional[TenantPlan] = None
    is_active: Optional[bool] = None
    branding: Optional[TenantBranding] = None


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: TenantPlan
    is_active: bool
    owner_id: str
    settings: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenantEmailConfigUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    use_tls: Optional[bool] = None


class TenantEmailConfigResponse(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None  # masked: "***" if set
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    use_tls: bool = True
    is_configured: bool = False


class TenantEmailTestRequest(BaseModel):
    recipient: str


class TenantStatsResponse(BaseModel):
    tenant_id: str
    total_apps: int
    total_users: int
    total_records: int
    storage_used_mb: float
