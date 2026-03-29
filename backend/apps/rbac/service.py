from __future__ import annotations

from typing import Optional

from apps.rbac.models import Permission, Role
from apps.rbac.repository import (
    create_role,
    get_role_by_name,
    list_roles,
    update_role,
)
from apps.rbac.schemas import PermissionSchema, UserPermissionsResponse
from core.exceptions import ConflictError, NotFoundError

# ── System role definitions ────────────────────────────────────────────────────

# Builder: full platform access — can design schema, flows, rules, admin, etc.
_BUILDER_PERMISSIONS: list[Permission] = [
    Permission(resource="admin",         actions=["create", "read", "update", "delete"]),
    Permission(resource="apps",          actions=["create", "read", "update", "delete"]),
    Permission(resource="models",        actions=["create", "read", "update", "delete"]),
    Permission(resource="records",       actions=["create", "read", "update", "delete", "submit", "cancel"]),
    Permission(resource="workflows",     actions=["create", "read", "update", "delete", "trigger"]),
    Permission(resource="rules",         actions=["create", "read", "update", "delete", "evaluate"]),
    Permission(resource="approvals",     actions=["create", "read", "update", "delete", "approve", "reject"]),
    Permission(resource="notifications", actions=["create", "read", "update", "delete"]),
    Permission(resource="portals",       actions=["create", "read", "update", "delete"]),
    Permission(resource="reports",       actions=["create", "read", "update", "delete"]),
    Permission(resource="integrations",  actions=["create", "read", "update", "delete"]),
    Permission(resource="schema",        actions=["build", "create", "read", "update", "delete"]),
    Permission(resource="settings",      actions=["create", "read", "update", "delete"]),
]

# Member: operations only — records, tasks, approvals, portal forms
_MEMBER_PERMISSIONS: list[Permission] = [
    Permission(resource="records",       actions=["create", "read", "update", "delete"]),
    Permission(resource="approvals",     actions=["read", "approve", "reject"]),
    Permission(resource="notifications", actions=["read"]),
    Permission(resource="portals",       actions=["read"]),
    Permission(resource="reports",       actions=["read"]),
]

_SYSTEM_ROLES = [
    ("builder", _BUILDER_PERMISSIONS, "Can build apps, define schemas, create workflows and rules."),
    ("member",  _MEMBER_PERMISSIONS,  "Operations only: records, tasks, approvals inbox."),
]

# Legacy duplicate names that should be deleted if they exist
_LEGACY_ROLE_NAMES = ["Builder"]  # capital-B duplicate seeded in a previous version


async def seed_system_roles(tenant_id: str) -> None:
    """Create the default system roles for a tenant. Idempotent — safe to call multiple times."""
    # Remove legacy duplicates (e.g. capital-B "Builder" created in older versions)
    for legacy_name in _LEGACY_ROLE_NAMES:
        legacy = await Role.find_one(
            Role.name == legacy_name, Role.tenant_id == tenant_id
        )
        if legacy:
            await legacy.delete()

    for name, permissions, description in _SYSTEM_ROLES:
        existing = await get_role_by_name(name, tenant_id)
        if existing is None:
            await create_role(
                name=name,
                tenant_id=tenant_id,
                app_id=None,
                permissions=permissions,
                is_system_role=True,
                description=description,
            )
        else:
            # Always sync permissions so existing roles stay up-to-date
            await update_role(existing, permissions=permissions, is_system_role=True)


async def seed_system_roles_all_tenants() -> int:
    """Seed/update system roles for ALL tenants. Returns count of tenants processed."""
    from apps.tenants.repository import list_tenants  # type: ignore[import]

    tenants = await list_tenants(limit=10_000)
    for tenant in tenants:
        await seed_system_roles(str(tenant.id))
    return len(tenants)


async def assign_role_to_user(user_id: str, role_name: str, tenant_id: Optional[str] = None) -> None:
    from apps.auth.models import User
    from beanie import PydanticObjectId

    try:
        oid = PydanticObjectId(user_id)
    except Exception:
        raise NotFoundError("User", user_id)

    user = await User.get(oid)
    if user is None:
        raise NotFoundError("User", user_id)

    # Atomic $addToSet prevents duplicate roles under concurrent requests
    await User.find_one(User.id == oid).update({"$addToSet": {"roles": role_name}})


async def revoke_role(user_id: str, role_name: str) -> None:
    from apps.auth.models import User
    from beanie import PydanticObjectId

    try:
        oid = PydanticObjectId(user_id)
    except Exception:
        raise NotFoundError("User", user_id)

    user = await User.get(oid)
    if user is None:
        raise NotFoundError("User", user_id)

    # Atomic $pull prevents race conditions under concurrent requests
    await User.find_one(User.id == oid).update({"$pull": {"roles": role_name}})


async def check_permission(
    user_id: str,
    resource: str,
    action: str,
    tenant_id: Optional[str] = None,
) -> bool:
    from apps.auth.repository import get_user_by_id

    user = await get_user_by_id(user_id)
    if user is None:
        return False
    if user.is_superuser:
        return True

    for role_name in user.roles:
        role = await get_role_by_name(role_name, tenant_id)
        if role is None:
            continue
        for perm in role.permissions:
            if perm.resource == resource and action in perm.actions:
                return True
    return False


async def get_user_permissions(user_id: str, tenant_id: Optional[str] = None) -> UserPermissionsResponse:
    from apps.auth.repository import get_user_by_id

    user = await get_user_by_id(user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    all_permissions: list[PermissionSchema] = []
    seen = set()

    for role_name in user.roles:
        role = await get_role_by_name(role_name, tenant_id)
        if role is None:
            continue
        for perm in role.permissions:
            key = (perm.resource, tuple(sorted(perm.actions)))
            if key not in seen:
                seen.add(key)
                all_permissions.append(PermissionSchema(resource=perm.resource, actions=perm.actions))

    return UserPermissionsResponse(
        user_id=user_id,
        roles=user.roles,
        permissions=all_permissions,
    )
