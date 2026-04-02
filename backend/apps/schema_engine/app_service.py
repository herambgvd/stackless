from __future__ import annotations

import re
import secrets

import structlog

log = structlog.get_logger(__name__)

from apps.schema_engine.repository import (
    create_app,
    get_app_by_id,
    get_app_by_slug,
    update_app,
)
from apps.schema_engine.schemas import AppCreate, AppUpdate
from core.exceptions import NotFoundError


def _slug_from_name(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug).strip("-")
    return slug[:48] or "app"


async def create_new_app(payload: AppCreate, tenant_id: str, created_by: str):
    slug = payload.slug or _slug_from_name(payload.name)
    if await get_app_by_slug(slug, tenant_id):
        slug = f"{slug[:44]}-{secrets.token_hex(2)}"
    return await create_app(
        name=payload.name,
        slug=slug,
        tenant_id=tenant_id,
        created_by=created_by,
        description=payload.description,
        icon=payload.icon,
        color=payload.color,
    )


async def update_existing_app(app_id: str, payload: AppUpdate, tenant_id: str):
    app = await get_app_by_id(app_id)
    if app is None or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)
    kwargs = payload.model_dump(exclude_none=True)
    return await update_app(app, **kwargs)


async def delete_app_cascade(app_id: str, tenant_id: str) -> None:
    """Delete an app, all its models, all records, all views, and dashboard widgets."""
    from apps.schema_engine.repository import list_models
    from apps.schema_engine.model_service import delete_model_cascade

    app = await get_app_by_id(app_id)
    if app is None or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)

    models = await list_models(app_id)
    for model in models:
        await delete_model_cascade(str(model.id), tenant_id)

    # Delete dashboard widgets for this app
    try:
        from apps.dashboard.models import DashboardWidget
        await DashboardWidget.find(
            DashboardWidget.app_id == app_id,
            DashboardWidget.tenant_id == tenant_id,
        ).delete()
    except Exception:
        pass

    await app.delete()
