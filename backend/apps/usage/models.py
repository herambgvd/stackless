from __future__ import annotations

from datetime import datetime, timezone

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class TenantUsageSnapshot(Document):
    """Point-in-time usage snapshot for a tenant.

    Snapshots are taken periodically (daily/weekly) to provide historical
    trend data without hitting live collections every request.
    """

    tenant_id: str
    snapshot_date: datetime
    app_count: int = 0
    record_count: int = 0
    workflow_count: int = 0
    user_count: int = 0
    storage_mb: float = 0.0
    workflow_runs_this_month: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "usage_snapshots"
        indexes = [
            IndexModel([("tenant_id", 1), ("snapshot_date", -1)]),
            IndexModel([("snapshot_date", -1)]),
        ]
