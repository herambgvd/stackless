from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status

from apps.dashboard.models import DashboardWidget
from apps.dashboard.schemas import WidgetCreate, WidgetUpdate, WidgetResponse, WidgetDataResponse
from apps.dashboard.service import get_all_widget_data
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError
from beanie import PydanticObjectId

router = APIRouter()


def _to_response(w: DashboardWidget) -> WidgetResponse:
    return WidgetResponse(
        id=str(w.id),
        app_id=w.app_id,
        tenant_id=w.tenant_id,
        title=w.title,
        widget_type=w.widget_type,
        model_slug=w.model_slug,
        aggregate_field=w.aggregate_field,
        aggregate_fn=w.aggregate_fn,
        filter_field=w.filter_field,
        filter_value=w.filter_value,
        group_by_field=w.group_by_field,
        date_field=w.date_field,
        order=w.order,
        col_span=w.col_span,
        created_at=w.created_at,
        updated_at=w.updated_at,
    )


@router.get("/apps/{app_id}/dashboard/widgets", response_model=list[WidgetResponse])
async def list_widgets(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    widgets = await DashboardWidget.find(
        DashboardWidget.app_id == app_id,
        DashboardWidget.tenant_id == tenant_id,
    ).sort(DashboardWidget.order).to_list()
    return [_to_response(w) for w in widgets]


@router.post("/apps/{app_id}/dashboard/widgets", response_model=WidgetResponse, status_code=status.HTTP_201_CREATED)
async def create_widget(
    app_id: str,
    payload: WidgetCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    w = DashboardWidget(
        app_id=app_id,
        tenant_id=tenant_id,
        **payload.model_dump(),
    )
    await w.insert()
    return _to_response(w)


@router.put("/apps/{app_id}/dashboard/widgets/{widget_id}", response_model=WidgetResponse)
async def update_widget(
    app_id: str,
    widget_id: str,
    payload: WidgetUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(widget_id)
    except Exception:
        raise NotFoundError("Widget", widget_id)
    w = await DashboardWidget.get(oid)
    if not w or w.app_id != app_id or w.tenant_id != tenant_id:
        raise NotFoundError("Widget", widget_id)
    for key, val in payload.model_dump(exclude_none=True).items():
        setattr(w, key, val)
    w.updated_at = datetime.now(tz=timezone.utc)
    await w.save()
    return _to_response(w)


@router.delete("/apps/{app_id}/dashboard/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget(
    app_id: str,
    widget_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(widget_id)
    except Exception:
        raise NotFoundError("Widget", widget_id)
    w = await DashboardWidget.get(oid)
    if not w or w.app_id != app_id or w.tenant_id != tenant_id:
        raise NotFoundError("Widget", widget_id)
    await w.delete()


@router.put("/apps/{app_id}/dashboard/widgets-order", status_code=status.HTTP_200_OK)
async def reorder_widgets(
    app_id: str,
    widget_ids: list[str],
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    """Persist a new widget order. Pass ordered list of widget IDs."""
    for i, wid in enumerate(widget_ids):
        try:
            oid = PydanticObjectId(wid)
        except Exception:
            continue
        w = await DashboardWidget.get(oid)
        if w and w.app_id == app_id and w.tenant_id == tenant_id:
            w.order = i
            w.updated_at = datetime.now(tz=timezone.utc)
            await w.save()
    return {"ok": True}


@router.get("/apps/{app_id}/dashboard/data")
async def get_dashboard_data(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
    date_from: Optional[datetime] = Query(None, alias="date_from"),
    date_to: Optional[datetime] = Query(None, alias="date_to"),
):
    return await get_all_widget_data(app_id, tenant_id, date_from=date_from, date_to=date_to)
