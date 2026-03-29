from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.tenants.models import Tenant


async def get_tenant_by_id(tenant_id: str) -> Optional[Tenant]:
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        return None
    return await Tenant.get(oid)


async def get_tenant_by_slug(slug: str) -> Optional[Tenant]:
    return await Tenant.find_one(Tenant.slug == slug)


async def list_tenants(skip: int = 0, limit: int = 50) -> list[Tenant]:
    return await Tenant.find_all().skip(skip).limit(limit).to_list()


async def create_tenant(
    *,
    name: str,
    slug: str,
    owner_id: str,
    plan: str = "free",
) -> Tenant:
    tenant = Tenant(name=name, slug=slug, owner_id=owner_id, plan=plan)  # type: ignore
    await tenant.insert()
    return tenant


async def update_tenant(tenant: Tenant, **kwargs) -> Tenant:
    for key, value in kwargs.items():
        if hasattr(tenant, key):
            setattr(tenant, key, value)
    tenant.updated_at = datetime.now(tz=timezone.utc)
    await tenant.save()
    return tenant


async def delete_tenant(tenant_id: str) -> bool:
    tenant = await get_tenant_by_id(tenant_id)
    if tenant is None:
        return False
    await tenant.delete()
    return True


async def count_tenants_by_owner(owner_id: str) -> int:
    return await Tenant.find(Tenant.owner_id == owner_id).count()
