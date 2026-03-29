from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.rbac.models import Permission, Role


async def get_role_by_id(role_id: str) -> Optional[Role]:
    try:
        oid = PydanticObjectId(role_id)
    except Exception:
        return None
    return await Role.get(oid)


async def get_role_by_name(name: str, tenant_id: Optional[str] = None) -> Optional[Role]:
    """Case-insensitive role lookup — handles 'Builder' vs 'builder' transparently."""
    pattern = re.compile(f"^{re.escape(name)}$", re.IGNORECASE)
    query = {"name": {"$regex": pattern}}
    if tenant_id:
        return await Role.find_one(query, Role.tenant_id == tenant_id)
    return await Role.find_one(query)


async def list_roles(tenant_id: Optional[str] = None, app_id: Optional[str] = None) -> list[Role]:
    filters = []
    if tenant_id:
        filters.append(Role.tenant_id == tenant_id)
    if app_id:
        filters.append(Role.app_id == app_id)
    if filters:
        return await Role.find(*filters).to_list()
    return await Role.find_all().to_list()


async def create_role(
    *,
    name: str,
    tenant_id: Optional[str],
    app_id: Optional[str],
    permissions: list[Permission],
    description: str = "",
    is_system_role: bool = False,
) -> Role:
    role = Role(
        name=name.lower(),  # always store lowercase
        tenant_id=tenant_id,
        app_id=app_id,
        permissions=permissions,
        description=description,
        is_system_role=is_system_role,
    )
    await role.insert()
    return role


async def update_role(role: Role, **kwargs) -> Role:
    for key, value in kwargs.items():
        if hasattr(role, key):
            setattr(role, key, value)
    role.updated_at = datetime.now(tz=timezone.utc)
    await role.save()
    return role


async def delete_role(role_id: str) -> bool:
    role = await get_role_by_id(role_id)
    if role is None:
        return False
    await role.delete()
    return True
