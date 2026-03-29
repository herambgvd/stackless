from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel
from datetime import datetime


class WidgetCreate(BaseModel):
    title: str
    widget_type: str  # kpi | bar | line | pie | donut
    model_slug: str
    aggregate_field: Optional[str] = None
    aggregate_fn: str = "count"
    filter_field: Optional[str] = None
    filter_value: Optional[str] = None
    group_by_field: Optional[str] = None
    date_field: Optional[str] = None
    order: int = 0
    col_span: int = 1


class WidgetUpdate(BaseModel):
    title: Optional[str] = None
    widget_type: Optional[str] = None
    model_slug: Optional[str] = None
    aggregate_field: Optional[str] = None
    aggregate_fn: Optional[str] = None
    filter_field: Optional[str] = None
    filter_value: Optional[str] = None
    group_by_field: Optional[str] = None
    date_field: Optional[str] = None
    order: Optional[int] = None
    col_span: Optional[int] = None


class WidgetResponse(BaseModel):
    id: str
    app_id: str
    tenant_id: str
    title: str
    widget_type: str
    model_slug: str
    aggregate_field: Optional[str]
    aggregate_fn: str
    filter_field: Optional[str]
    filter_value: Optional[str]
    group_by_field: Optional[str]
    date_field: Optional[str]
    order: int
    col_span: int
    created_at: datetime
    updated_at: datetime


class WidgetDataResponse(BaseModel):
    widget_id: str
    data: Any  # KPI: number; chart: list of {label, value}
