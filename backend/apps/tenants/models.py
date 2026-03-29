from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import IndexModel


class TenantPlan(str, Enum):
    FREE = "free"
    STARTER = "starter"
    GROWTH = "growth"
    BUSINESS = "business"  # kept for backwards compatibility — alias for GROWTH
    ENTERPRISE = "enterprise"


class TenantBrandingSettings(BaseModel):
    logo_url: Optional[str] = None
    primary_color: str = "#6366f1"
    secondary_color: str = "#8b5cf6"
    domain: Optional[str] = None
    favicon_url: Optional[str] = None


class TenantSettings(BaseModel):
    branding: TenantBrandingSettings = Field(default_factory=TenantBrandingSettings)
    max_apps: int = 5
    max_users: int = 10
    storage_limit_mb: int = 1024
    features: list[str] = Field(default_factory=list)


class Tenant(Document):
    name: str
    slug: Indexed(str, unique=True)  # type: ignore[valid-type]
    plan: TenantPlan = TenantPlan.FREE
    settings: TenantSettings = Field(default_factory=TenantSettings)
    is_active: bool = True
    owner_id: str
    # ── Billing fields ────────────────────────────────────────────────────────
    stripe_customer_id: Optional[str] = None
    subscription_status: str = "active"  # mirrors Subscription.status for quick checks
    # ─────────────────────────────────────────────────────────────────────────
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "tenants"
        indexes = [
            IndexModel([("owner_id", 1)]),
            IndexModel([("plan", 1)]),
        ]
