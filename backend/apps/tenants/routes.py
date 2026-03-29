from __future__ import annotations

from fastapi import APIRouter, Depends, status

from apps.tenants.repository import (
    delete_tenant,
    get_tenant_by_id,
    list_tenants,
)
from apps.tenants.schemas import TenantCreate, TenantResponse, TenantStatsResponse, TenantUpdate
from apps.tenants.service import create_new_tenant, get_tenant_stats, update_tenant_details
from core.dependencies import get_current_active_user, require_role, require_superuser
from core.exceptions import ForbiddenError, NotFoundError

router = APIRouter()


@router.get("", response_model=list[TenantResponse])
async def list_all_tenants(
    skip: int = 0,
    limit: int = 50,
    _=Depends(require_superuser),
):
    """List all tenants (Super Admin only)."""
    tenants = await list_tenants(skip=skip, limit=limit)
    return [
        TenantResponse(
            id=str(t.id),
            name=t.name,
            slug=t.slug,
            plan=t.plan,
            is_active=t.is_active,
            owner_id=t.owner_id,
            settings=t.settings.model_dump(),
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tenants
    ]


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_endpoint(
    payload: TenantCreate,
    current_user=Depends(require_superuser),
):
    """Create a new tenant with an org admin (Super Admin only)."""
    tenant = await create_new_tenant(payload, owner_id=str(current_user.id))
    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        is_active=tenant.is_active,
        owner_id=tenant.owner_id,
        settings=tenant.settings.model_dump(),
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: str,
    current_user=Depends(get_current_active_user),
):
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise NotFoundError("Tenant", tenant_id)
    # Only superusers or the tenant's own users may view tenant details
    if not current_user.is_superuser and str(current_user.tenant_id) != str(tenant.id):
        raise ForbiddenError("Access to this tenant is not allowed.")
    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        is_active=tenant.is_active,
        owner_id=tenant.owner_id,
        settings=tenant.settings.model_dump(),
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant_endpoint(
    tenant_id: str,
    payload: TenantUpdate,
    current_user=Depends(get_current_active_user),
):
    if not current_user.is_superuser and str(current_user.tenant_id) != tenant_id:
        raise ForbiddenError("You can only update your own tenant.")
    tenant = await update_tenant_details(tenant_id, payload, str(current_user.id))
    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        is_active=tenant.is_active,
        owner_id=tenant.owner_id,
        settings=tenant.settings.model_dump(),
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant_endpoint(
    tenant_id: str,
    _=Depends(require_superuser),
):
    deleted = await delete_tenant(tenant_id)
    if not deleted:
        raise NotFoundError("Tenant", tenant_id)


@router.get("/{tenant_id}/stats", response_model=TenantStatsResponse)
async def tenant_stats(
    tenant_id: str,
    current_user=Depends(get_current_active_user),
):
    if not current_user.is_superuser and str(current_user.tenant_id) != tenant_id:
        raise ForbiddenError("Access to this tenant is not allowed.")
    return await get_tenant_stats(tenant_id)
