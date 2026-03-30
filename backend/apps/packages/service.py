from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.packages.models import Package, PackageLimits
from apps.packages.schemas import PackageCreate, PackageUpdate


async def get_all_packages(active_only: bool = False) -> list[Package]:
    if active_only:
        return await Package.find(Package.is_active == True).sort(+Package.sort_order).to_list()  # noqa: E712
    return await Package.find_all().sort(+Package.sort_order).to_list()


async def get_package_by_id(package_id: str) -> Optional[Package]:
    try:
        return await Package.get(PydanticObjectId(package_id))
    except Exception:
        return None


async def get_package_by_slug(slug: str) -> Optional[Package]:
    return await Package.find_one(Package.slug == slug)


async def create_package(data: PackageCreate) -> Package:
    pkg = Package(**data.model_dump())
    await pkg.insert()
    return pkg


async def update_package(package_id: str, data: PackageUpdate) -> Optional[Package]:
    pkg = await get_package_by_id(package_id)
    if not pkg:
        return None
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(tz=timezone.utc)
    await pkg.set(update_data)
    return pkg


async def delete_package(package_id: str) -> bool:
    pkg = await get_package_by_id(package_id)
    if not pkg:
        return False
    await pkg.delete()
    return True


async def seed_default_packages() -> int:
    """Seed default packages from plan_limits.py if the packages collection is empty. Idempotent."""
    count = await Package.count()
    if count > 0:
        return 0

    from core.plan_limits import PLAN_LIMITS

    defaults = [
        {"name": "Free",       "slug": "free",       "price_monthly": 0,   "price_yearly": 0,    "sort_order": 0},
        {"name": "Starter",    "slug": "starter",    "price_monthly": 29,  "price_yearly": 290,  "sort_order": 1},
        {"name": "Growth",     "slug": "growth",     "price_monthly": 79,  "price_yearly": 790,  "sort_order": 2},
        {"name": "Business",   "slug": "business",   "price_monthly": 149, "price_yearly": 1490, "sort_order": 3},
        {"name": "Enterprise", "slug": "enterprise", "price_monthly": 299, "price_yearly": 2990, "sort_order": 4},
    ]

    seeded = 0
    for d in defaults:
        raw = PLAN_LIMITS.get(d["slug"], PLAN_LIMITS.get("free", {}))
        limits = PackageLimits(
            max_apps=raw.get("max_apps", 3),
            max_records=raw.get("max_records", 500),
            max_workflows=raw.get("max_workflows", 1),
            max_users=raw.get("max_users", 2),
            storage_mb=raw.get("storage_mb", 100),
            ai_builder=raw.get("ai_builder", False),
        )
        pkg = Package(**d, limits=limits)
        await pkg.insert()
        seeded += 1

    return seeded
