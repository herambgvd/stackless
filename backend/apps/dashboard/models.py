from __future__ import annotations
from typing import Optional
from beanie import Document
from pydantic import BaseModel
from datetime import datetime, timezone


class DashboardWidget(Document):
    """A configured chart/KPI widget on an app's dashboard."""
    app_id: str
    tenant_id: str
    title: str
    widget_type: str  # kpi | bar | line | pie | donut
    model_slug: str   # which model to query
    # Aggregation config
    aggregate_field: Optional[str] = None  # None = count records
    aggregate_fn: str = "count"            # count | sum | avg | min | max
    # Optional filter
    filter_field: Optional[str] = None
    filter_value: Optional[str] = None
    # For bar/line charts — group records by this field's value
    group_by_field: Optional[str] = None
    # For time-series: date field to use
    date_field: Optional[str] = None
    # For "report" widget type: embed a saved report
    report_id: Optional[str] = None
    # Layout
    order: int = 0
    col_span: int = 1  # 1 = half-width, 2 = full-width
    created_at: datetime = None
    updated_at: datetime = None

    def __init__(self, **data):
        if data.get("created_at") is None:
            data["created_at"] = datetime.now(tz=timezone.utc)
        if data.get("updated_at") is None:
            data["updated_at"] = datetime.now(tz=timezone.utc)
        super().__init__(**data)

    class Settings:
        name = "dashboard_widgets"
        indexes = [
            [("app_id", 1), ("tenant_id", 1)],
        ]
