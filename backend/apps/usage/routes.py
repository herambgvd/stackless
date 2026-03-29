from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from apps.usage.service import get_all_tenants_usage, get_platform_stats, get_tenant_live_usage
from core.dependencies import get_current_active_user, require_superuser

router = APIRouter()


@router.get("/platform")
async def platform_stats(
    _=Depends(require_superuser),
):
    """Platform-wide aggregate statistics.  Superuser only."""
    return await get_platform_stats()


@router.get("/tenants")
async def all_tenants_usage(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _=Depends(require_superuser),
):
    """Paginated usage summary for every tenant.  Superuser only."""
    items = await get_all_tenants_usage(skip=skip, limit=limit)
    return {"items": items, "skip": skip, "limit": limit, "count": len(items)}


@router.get("/tenant/{tenant_id}")
async def single_tenant_usage(
    tenant_id: str,
    current_user=Depends(get_current_active_user),
):
    """Live usage for a specific tenant.

    Superusers may query any tenant_id.  Regular users may only query their
    own tenant.
    """
    from core.exceptions import ForbiddenError

    if not current_user.is_superuser:
        user_tenant = str(current_user.tenant_id) if current_user.tenant_id else None
        if user_tenant != tenant_id:
            raise ForbiddenError("You may only view usage for your own organisation.")

    return await get_tenant_live_usage(tenant_id)


@router.get("/me")
async def my_usage(
    current_user=Depends(get_current_active_user),
):
    """Live usage for the currently authenticated user's tenant."""
    from core.exceptions import ForbiddenError

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    if not tenant_id:
        raise ForbiddenError("No tenant associated with your account.")

    return await get_tenant_live_usage(tenant_id)
