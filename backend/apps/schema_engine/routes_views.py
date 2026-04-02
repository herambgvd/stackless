from __future__ import annotations

from fastapi import APIRouter, Depends, status

from apps.schema_engine.repository import list_views, get_view_by_id, create_view, update_view, delete_view
from apps.schema_engine.schemas import ViewCreate, ViewUpdate, ViewResponse
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import NotFoundError

router = APIRouter()


def _view_to_response(v) -> ViewResponse:
    return ViewResponse(
        id=str(v.id),
        name=v.name,
        app_id=v.app_id,
        model_slug=v.model_slug,
        tenant_id=v.tenant_id,
        user_id=v.user_id,
        type=v.type,
        filter_conditions=[{"field": f.field, "operator": f.operator, "value": f.value} for f in v.filter_conditions],
        sort_field=v.sort_field,
        sort_dir=v.sort_dir,
        visible_columns=v.visible_columns,
        group_by_field=v.group_by_field,
        column_widths=v.column_widths,
        is_default=v.is_default,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


@router.get("/apps/{app_id}/{model_slug}/views", response_model=list[ViewResponse])
async def list_views_endpoint(
    app_id: str,
    model_slug: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    views = await list_views(app_id, model_slug, tenant_id, user_id=str(current_user.id))
    return [_view_to_response(v) for v in views]


@router.post("/apps/{app_id}/{model_slug}/views", response_model=ViewResponse, status_code=status.HTTP_201_CREATED)
async def create_view_endpoint(
    app_id: str,
    model_slug: str,
    payload: ViewCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    view = await create_view(
        name=payload.name, app_id=app_id, model_slug=model_slug,
        tenant_id=tenant_id,
        user_id=str(current_user.id) if not payload.is_default else None,
        type=payload.type,
        filter_conditions=[f.model_dump() for f in payload.filter_conditions],
        sort_field=payload.sort_field, sort_dir=payload.sort_dir,
        visible_columns=payload.visible_columns,
        group_by_field=payload.group_by_field,
        column_widths=payload.column_widths,
        is_default=payload.is_default,
    )
    return _view_to_response(view)


@router.put("/apps/{app_id}/{model_slug}/views/{view_id}", response_model=ViewResponse)
async def update_view_endpoint(
    app_id: str,
    model_slug: str,
    view_id: str,
    payload: ViewUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    view = await get_view_by_id(view_id)
    if view is None or view.app_id != app_id or view.tenant_id != tenant_id:
        raise NotFoundError("View", view_id)
    if view.user_id and view.user_id != str(current_user.id):
        from core.exceptions import ForbiddenError
        raise ForbiddenError("You can only edit your own views.")
    kwargs = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "filter_conditions" in kwargs:
        from apps.schema_engine.models import ViewFilter
        kwargs["filter_conditions"] = [ViewFilter(**f) for f in kwargs["filter_conditions"]]
    await update_view(view, **kwargs)
    return _view_to_response(view)


@router.delete("/apps/{app_id}/{model_slug}/views/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_view_endpoint(
    app_id: str,
    model_slug: str,
    view_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    view = await get_view_by_id(view_id)
    if view is None or view.tenant_id != tenant_id:
        raise NotFoundError("View", view_id)
    if view.user_id and view.user_id != str(current_user.id):
        from core.exceptions import ForbiddenError
        raise ForbiddenError("You can only delete your own views.")
    await delete_view(view_id)
