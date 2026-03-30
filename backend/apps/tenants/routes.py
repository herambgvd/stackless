from __future__ import annotations

from fastapi import APIRouter, Depends, status

from apps.tenants.repository import (
    delete_tenant,
    get_tenant_by_id,
    list_tenants,
)
from apps.tenants.schemas import (
    TenantCreate, TenantResponse, TenantStatsResponse, TenantUpdate,
    TenantEmailConfigUpdate, TenantEmailConfigResponse, TenantEmailTestRequest,
)
from apps.tenants.service import (
    create_new_tenant, get_tenant_stats, update_tenant_details,
    get_email_config, update_email_config, reset_email_config,
)
from core.dependencies import get_current_active_user, get_tenant_id, require_role, require_superuser
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


@router.get("/email-config", response_model=TenantEmailConfigResponse)
async def get_tenant_email_config(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Get the current tenant's email configuration."""
    cfg = await get_email_config(tenant_id)
    return TenantEmailConfigResponse(
        smtp_host=cfg.smtp_host,
        smtp_port=cfg.smtp_port,
        smtp_username=cfg.smtp_username,
        smtp_password="***" if cfg.smtp_password else None,
        email_from=cfg.email_from,
        email_from_name=cfg.email_from_name,
        use_tls=cfg.use_tls,
        is_configured=cfg.is_configured,
    )


@router.put("/email-config", response_model=TenantEmailConfigResponse)
async def update_tenant_email_config(
    payload: TenantEmailConfigUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Update the current tenant's SMTP email configuration."""
    tenant = await update_email_config(tenant_id, payload)
    cfg = tenant.email_config
    return TenantEmailConfigResponse(
        smtp_host=cfg.smtp_host,
        smtp_port=cfg.smtp_port,
        smtp_username=cfg.smtp_username,
        smtp_password="***" if cfg.smtp_password else None,
        email_from=cfg.email_from,
        email_from_name=cfg.email_from_name,
        use_tls=cfg.use_tls,
        is_configured=cfg.is_configured,
    )


@router.delete("/email-config", status_code=status.HTTP_204_NO_CONTENT)
async def reset_tenant_email_config(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Reset tenant email config to system defaults."""
    await reset_email_config(tenant_id)


@router.post("/email-config/test", status_code=status.HTTP_200_OK)
async def test_tenant_email_config(
    payload: TenantEmailTestRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Send a test email using the tenant's configured SMTP settings."""
    from apps.notifications.channels.email import EmailChannel
    try:
        await EmailChannel(tenant_id=tenant_id).send(
            recipient=payload.recipient,
            subject_template="Test email from Stackless",
            body_template="<p>This is a test email confirming your SMTP configuration is working correctly.</p>",
            context={},
        )
        return {"success": True, "message": f"Test email sent to {payload.recipient}"}
    except Exception as exc:
        return {"success": False, "message": str(exc)}


@router.get("/{tenant_id}/stats", response_model=TenantStatsResponse)
async def tenant_stats(
    tenant_id: str,
    current_user=Depends(get_current_active_user),
):
    if not current_user.is_superuser and str(current_user.tenant_id) != tenant_id:
        raise ForbiddenError("Access to this tenant is not allowed.")
    return await get_tenant_stats(tenant_id)
