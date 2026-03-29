from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TenantLiveUsage(BaseModel):
    tenant_id: str
    app_count: int
    user_count: int
    workflow_count: int
    record_count: int


class TenantUsageSummary(BaseModel):
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    plan: str
    is_active: bool
    owner_id: str
    created_at: datetime
    app_count: int
    user_count: int
    workflow_count: int
    record_count: int


class PlanBreakdown(BaseModel):
    plan: str
    count: int


class PlatformStats(BaseModel):
    total_tenants: int
    total_users: int
    new_tenants_last_30_days: int
    plan_breakdown: list[PlanBreakdown]
