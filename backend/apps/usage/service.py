from __future__ import annotations

from datetime import datetime, timezone, timedelta

from core.config import get_settings
from core.database import get_motor_client

settings = get_settings()


async def get_tenant_live_usage(tenant_id: str) -> dict:
    """Get current real-time usage counts for a single tenant.

    Queries the live MongoDB collections directly to give an accurate
    point-in-time view of what the tenant is consuming.

    Note: record_count reflects the number of AppDefinition documents
    (app schemas), not dynamic record rows.  Dynamic record rows live in
    per-app collections whose names are not enumerable without scanning
    every collection, so that metric is returned as 0 pending a future
    collection-registry implementation.
    """
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]

    app_count, user_count, workflow_count = await _count_parallel(
        db,
        ("app_definitions", tenant_id),
        ("users", tenant_id),
        ("workflows", tenant_id),
    )

    return {
        "tenant_id": tenant_id,
        "app_count": app_count,
        "user_count": user_count,
        "workflow_count": workflow_count,
        # Dynamic record rows require scanning per-app collections; deferred.
        "record_count": 0,
    }


async def get_all_tenants_usage(skip: int = 0, limit: int = 50) -> list[dict]:
    """Get usage summary for all tenants (admin / platform view).

    Returns each tenant's metadata combined with its live usage counters.
    """
    from apps.tenants.models import Tenant

    tenants = await Tenant.find().sort(Tenant.created_at).skip(skip).limit(limit).to_list()

    results: list[dict] = []
    for tenant in tenants:
        tenant_id = str(tenant.id)
        usage = await get_tenant_live_usage(tenant_id)
        results.append(
            {
                "tenant_id": tenant_id,
                "tenant_name": tenant.name,
                "tenant_slug": tenant.slug,
                "plan": tenant.plan.value,
                "is_active": tenant.is_active,
                "owner_id": tenant.owner_id,
                "created_at": tenant.created_at.isoformat(),
                "app_count": usage["app_count"],
                "user_count": usage["user_count"],
                "workflow_count": usage["workflow_count"],
                "record_count": usage["record_count"],
            }
        )

    return results


async def get_platform_stats() -> dict:
    """Platform-wide aggregate stats for the superadmin dashboard.

    Returns:
        total_tenants: All tenant documents.
        total_users:   All user documents (across all tenants).
        new_tenants_last_30_days: Tenants created in the rolling 30-day window.
        plan_breakdown: List of {plan, count} dicts aggregated from the
                        tenants collection.
    """
    from apps.tenants.models import Tenant
    from apps.auth.models import User

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=30)

    total_tenants = await Tenant.count()
    total_users = await User.count()
    new_tenants_last_30_days = await Tenant.find(Tenant.created_at >= cutoff).count()

    # Aggregate tenant counts by plan
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]
    pipeline = [
        {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    cursor = db["tenants"].aggregate(pipeline)
    plan_breakdown = [
        {"plan": doc["_id"], "count": doc["count"]}
        async for doc in cursor
    ]

    return {
        "total_tenants": total_tenants,
        "total_users": total_users,
        "new_tenants_last_30_days": new_tenants_last_30_days,
        "plan_breakdown": plan_breakdown,
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _count_parallel(db, *collection_tenant_pairs: tuple[str, str]) -> list[int]:
    """Run count_documents concurrently for multiple collections."""
    import asyncio

    async def _count(collection: str, tenant_id: str) -> int:
        return await db[collection].count_documents({"tenant_id": tenant_id})

    return list(
        await asyncio.gather(*[_count(col, tid) for col, tid in collection_tenant_pairs])
    )
