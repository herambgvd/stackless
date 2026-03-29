from __future__ import annotations

from apps.tenants.models import Tenant, TenantBrandingSettings
from apps.tenants.repository import (
    create_tenant,
    delete_tenant,
    get_tenant_by_id,
    get_tenant_by_slug,
    list_tenants,
    update_tenant,
)
from apps.tenants.schemas import TenantCreate, TenantStatsResponse, TenantUpdate
from core.database import get_motor_client
from core.exceptions import ConflictError, ForbiddenError, NotFoundError
from core.config import get_settings

settings = get_settings()


async def create_new_tenant(payload: TenantCreate, owner_id: str) -> Tenant:
    existing = await get_tenant_by_slug(payload.slug)
    if existing:
        raise ConflictError(f"Tenant with slug '{payload.slug}' already exists.")

    from apps.auth.repository import get_user_by_id, get_user_by_email, update_user
    from apps.auth.repository import create_user as create_user_record
    from core.security import hash_password

    creator = await get_user_by_id(owner_id)

    # Determine the actual org admin
    if creator and creator.is_superuser and payload.admin_email:
        # Super Admin is onboarding an org — create the org admin user
        existing_admin = await get_user_by_email(payload.admin_email)
        if existing_admin:
            raise ConflictError(f"A user with email '{payload.admin_email}' already exists.")

        tenant = await create_tenant(
            name=payload.name,
            slug=payload.slug,
            owner_id=owner_id,  # Super Admin is the platform owner
            plan=payload.plan,
        )

        # Create the org admin user with this tenant
        await create_user_record(
            email=payload.admin_email,
            hashed_password=hash_password(payload.admin_password),
            full_name=payload.admin_name or payload.admin_email.split("@")[0],
            tenant_id=str(tenant.id),
            roles=["admin"],
        )
    else:
        # Self-service: user creates their own tenant
        tenant = await create_tenant(
            name=payload.name,
            slug=payload.slug,
            owner_id=owner_id,
            plan=payload.plan,
        )

        if creator and not creator.tenant_id:
            await update_user(creator, tenant_id=str(tenant.id), roles=["admin"])

    # Seed the default system roles (builder + member) for this tenant
    try:
        from apps.rbac.service import seed_system_roles
        await seed_system_roles(str(tenant.id))
    except Exception:
        pass  # Non-blocking — roles can be created later via admin UI

    return tenant


async def update_tenant_details(tenant_id: str, payload: TenantUpdate, current_user_id: str) -> Tenant:
    tenant = await get_tenant_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Tenant", tenant_id)

    update_kwargs: dict = {}
    if payload.name is not None:
        update_kwargs["name"] = payload.name
    if payload.plan is not None:
        update_kwargs["plan"] = payload.plan
    if payload.is_active is not None:
        update_kwargs["is_active"] = payload.is_active
    if payload.branding is not None:
        branding_data = payload.branding.model_dump(exclude_none=True)
        for k, v in branding_data.items():
            setattr(tenant.settings.branding, k, v)
        update_kwargs["settings"] = tenant.settings

    return await update_tenant(tenant, **update_kwargs)


async def update_branding(tenant_id: str, branding_data: dict) -> Tenant:
    tenant = await get_tenant_by_id(tenant_id)
    if tenant is None:
        raise NotFoundError("Tenant", tenant_id)
    for k, v in branding_data.items():
        if hasattr(tenant.settings.branding, k):
            setattr(tenant.settings.branding, k, v)
    return await update_tenant(tenant, settings=tenant.settings)


async def get_tenant_stats(tenant_id: str) -> TenantStatsResponse:
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]

    total_apps = await db["app_definitions"].count_documents({"tenant_id": tenant_id})
    total_users = await db["users"].count_documents({"tenant_id": tenant_id})

    return TenantStatsResponse(
        tenant_id=tenant_id,
        total_apps=total_apps,
        total_users=total_users,
        total_records=0,
        storage_used_mb=0.0,
    )
