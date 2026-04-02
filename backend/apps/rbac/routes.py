from __future__ import annotations

from fastapi import APIRouter, Depends, status

from datetime import datetime, timezone
from apps.rbac.models import Permission, RoleProfile
from apps.rbac.repository import (
    create_role,
    delete_role,
    get_role_by_id,
    list_roles,
    update_role,
)
from apps.rbac.schemas import (
    AssignRoleRequest,
    RevokeRoleRequest,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
    UserPermissionsResponse,
)
from apps.rbac.service import assign_role_to_user, get_user_permissions, revoke_role
from core.dependencies import get_current_active_user, get_tenant_id, require_role
from core.exceptions import ConflictError, ForbiddenError, NotFoundError

router = APIRouter()


def _role_to_response(role) -> RoleResponse:
    from apps.rbac.schemas import PermissionSchema

    return RoleResponse(
        id=str(role.id),
        name=role.name,
        tenant_id=role.tenant_id,
        app_id=role.app_id,
        permissions=[PermissionSchema(resource=p.resource, actions=p.actions, conditions=p.conditions) for p in role.permissions],
        is_system_role=role.is_system_role,
        description=role.description,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles_endpoint(
    app_id: str | None = None,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    roles = await list_roles(tenant_id=tenant_id, app_id=app_id)
    return [_role_to_response(r) for r in roles]


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role_endpoint(
    payload: RoleCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    permissions = [Permission(resource=p.resource, actions=p.actions, conditions=p.conditions) for p in payload.permissions]
    role = await create_role(
        name=payload.name,
        tenant_id=tenant_id,
        app_id=payload.app_id,
        permissions=permissions,
        description=payload.description,
    )
    return _role_to_response(role)


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role_endpoint(
    role_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    role = await get_role_by_id(role_id)
    if not role:
        raise NotFoundError("Role", role_id)
    if not current_user.is_superuser and role.tenant_id and role.tenant_id != tenant_id:
        raise ForbiddenError("Access to this role is not allowed.")
    return _role_to_response(role)


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role_endpoint(
    role_id: str,
    payload: RoleUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_role(["admin"])),
):
    role = await get_role_by_id(role_id)
    if not role:
        raise NotFoundError("Role", role_id)
    if not current_user.is_superuser and role.tenant_id and role.tenant_id != tenant_id:
        raise ForbiddenError("Access to this role is not allowed.")
    kwargs: dict = {}
    if payload.name is not None:
        kwargs["name"] = payload.name
    if payload.description is not None:
        kwargs["description"] = payload.description
    if payload.permissions is not None:
        kwargs["permissions"] = [
            Permission(resource=p.resource, actions=p.actions, conditions=p.conditions)
            for p in payload.permissions
        ]
    updated = await update_role(role, **kwargs)
    return _role_to_response(updated)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role_endpoint(
    role_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_role(["admin"])),
):
    role = await get_role_by_id(role_id)
    if not role:
        raise NotFoundError("Role", role_id)
    if not current_user.is_superuser and role.tenant_id and role.tenant_id != tenant_id:
        raise ForbiddenError("Access to this role is not allowed.")
    await delete_role(role_id)


@router.post("/roles/assign", status_code=status.HTTP_200_OK)
async def assign_role(
    payload: AssignRoleRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    # Validate target user belongs to current tenant
    from apps.auth.repository import get_user_by_id
    target_user = await get_user_by_id(payload.user_id)
    if not target_user or target_user.tenant_id != tenant_id:
        raise ForbiddenError("Cannot assign roles to users outside your tenant.")
    await assign_role_to_user(payload.user_id, payload.role_name)
    return {"detail": f"Role '{payload.role_name}' assigned to user '{payload.user_id}'."}


@router.post("/roles/revoke", status_code=status.HTTP_200_OK)
async def revoke_role_endpoint(
    payload: RevokeRoleRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    # Validate target user belongs to current tenant
    from apps.auth.repository import get_user_by_id
    target_user = await get_user_by_id(payload.user_id)
    if not target_user or target_user.tenant_id != tenant_id:
        raise ForbiddenError("Cannot revoke roles from users outside your tenant.")
    await revoke_role(payload.user_id, payload.role_name)
    return {"detail": f"Role '{payload.role_name}' revoked from user '{payload.user_id}'."}


@router.get("/users/{user_id}/permissions", response_model=UserPermissionsResponse)
async def user_permissions(
    user_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    return await get_user_permissions(user_id, tenant_id)


# ── Role Profiles ─────────────────────────────────────────────────────────────

@router.get("/role-profiles")
async def list_role_profiles(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    profiles = await RoleProfile.find(RoleProfile.tenant_id == tenant_id).to_list()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "roles": p.roles,
            "tenant_id": p.tenant_id,
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        }
        for p in profiles
    ]


@router.post("/role-profiles", status_code=status.HTTP_201_CREATED)
async def create_role_profile(
    body: dict,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    name = body.get("name", "").strip()
    if not name:
        from fastapi import HTTPException
        raise HTTPException(400, "name is required")

    existing = await RoleProfile.find_one(
        RoleProfile.tenant_id == tenant_id,
        RoleProfile.name == name,
    )
    if existing:
        from fastapi import HTTPException
        raise HTTPException(409, f"Profile '{name}' already exists")

    profile = RoleProfile(
        name=name,
        tenant_id=tenant_id,
        description=body.get("description", ""),
        roles=body.get("roles", []),
    )
    await profile.insert()
    return {
        "id": str(profile.id),
        "name": profile.name,
        "description": profile.description,
        "roles": profile.roles,
        "tenant_id": profile.tenant_id,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@router.put("/role-profiles/{profile_id}")
async def update_role_profile(
    profile_id: str,
    body: dict,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(profile_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    profile = await RoleProfile.get(oid)
    if not profile or profile.tenant_id != tenant_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    for k in ("name", "description", "roles"):
        if k in body:
            setattr(profile, k, body[k])
    profile.updated_at = datetime.now(tz=timezone.utc)
    await profile.save()
    return {
        "id": str(profile.id),
        "name": profile.name,
        "description": profile.description,
        "roles": profile.roles,
        "tenant_id": profile.tenant_id,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@router.delete("/role-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role_profile(
    profile_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(profile_id)
    except Exception:
        return
    profile = await RoleProfile.get(oid)
    if profile and profile.tenant_id == tenant_id:
        await profile.delete()


@router.post("/role-profiles/{profile_id}/assign")
async def assign_profile_to_user(
    profile_id: str,
    body: dict,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Assign all roles in a profile to a user."""
    from beanie import PydanticObjectId
    from apps.rbac.service import assign_role_to_user

    try:
        oid = PydanticObjectId(profile_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    profile = await RoleProfile.get(oid)
    if not profile or profile.tenant_id != tenant_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    user_id = body.get("user_id")
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(400, "user_id is required")

    # Validate target user belongs to current tenant
    from apps.auth.repository import get_user_by_id
    target_user = await get_user_by_id(user_id)
    if not target_user or target_user.tenant_id != tenant_id:
        raise ForbiddenError("Cannot assign profile to users outside your tenant.")

    for role_name in profile.roles:
        await assign_role_to_user(user_id, role_name)

    return {"detail": f"Profile '{profile.name}' applied — {len(profile.roles)} role(s) assigned to user."}
