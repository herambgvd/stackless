from __future__ import annotations

from fastapi import APIRouter, Depends, status

from apps.schema_engine.repository import get_app_by_id, list_apps
from apps.schema_engine.schemas import AppCreate, AppResponse, AppUpdate
from apps.schema_engine.service import create_new_app, update_existing_app, delete_app_cascade
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


def _app_to_response(app) -> AppResponse:
    return AppResponse(
        id=str(app.id),
        name=app.name,
        slug=app.slug,
        tenant_id=app.tenant_id,
        description=app.description,
        icon=app.icon,
        color=app.color,
        created_by=app.created_by,
        created_at=app.created_at,
        updated_at=app.updated_at,
    )


@router.get("/apps", response_model=list[AppResponse])
async def list_apps_endpoint(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    apps = await list_apps(tenant_id)
    return [_app_to_response(a) for a in apps]


@router.post("/apps", response_model=AppResponse, status_code=status.HTTP_201_CREATED)
async def create_app_endpoint(
    payload: AppCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("apps", "create")),
):
    app = await create_new_app(payload, tenant_id, str(current_user.id))
    return _app_to_response(app)


@router.get("/apps/{app_id}", response_model=AppResponse)
async def get_app_endpoint(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    app = await get_app_by_id(app_id)
    if not app or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)
    return _app_to_response(app)


@router.put("/apps/{app_id}", response_model=AppResponse)
async def update_app_endpoint(
    app_id: str,
    payload: AppUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    app = await update_existing_app(app_id, payload, tenant_id)
    return _app_to_response(app)


@router.delete("/apps/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_app_endpoint(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "delete")),
):
    await delete_app_cascade(app_id, tenant_id)
