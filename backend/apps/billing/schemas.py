from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from apps.billing.models import SubscriptionStatus
from apps.tenants.models import TenantPlan


class SubscriptionOut(BaseModel):
    tenant_id: str
    plan: TenantPlan
    status: SubscriptionStatus
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    cancel_at_period_end: bool = False
    created_at: datetime
    updated_at: datetime


class UsageMeter(BaseModel):
    """Current usage count for a single resource."""
    resource: str
    label: str
    current: int
    limit: int  # -1 means unlimited


class UsageSummary(BaseModel):
    apps: UsageMeter
    records: UsageMeter
    workflows: UsageMeter
    users: UsageMeter
    storage_mb: UsageMeter


class SubscriptionWithUsage(BaseModel):
    subscription: SubscriptionOut
    usage: UsageSummary
    plan_limits: dict[str, Any]


class CheckoutRequest(BaseModel):
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalRequest(BaseModel):
    return_url: str


class PortalResponse(BaseModel):
    portal_url: str
