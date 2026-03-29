from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Any
from beanie import Document
from pydantic import BaseModel, Field


# ── Report Builder models ─────────────────────────────────────────────────────

class ReportColumn(BaseModel):
    field: str
    label: str
    type: str = "data"  # data, currency, int, float, date, datetime
    width: Optional[int] = None
    aggregate: Optional[str] = None  # sum, avg, count, min, max


class ReportFilter(BaseModel):
    field: str
    operator: str  # =, !=, >, <, >=, <=, like, in, not in, is set, is not set
    value: Any = None


class ReportSorting(BaseModel):
    field: str
    direction: str = "asc"  # asc, desc


class SavedReport(Document):
    tenant_id: str
    app_id: str
    name: str
    description: Optional[str] = None
    report_type: str = "query"  # query, script, mongo
    model_slug: str
    columns: List[ReportColumn] = Field(default_factory=list)
    filters: List[ReportFilter] = Field(default_factory=list)
    sorting: List[ReportSorting] = Field(default_factory=list)
    group_by: Optional[str] = None
    show_totals: bool = False
    chart_type: Optional[str] = None  # bar, line, pie, None
    chart_x_field: Optional[str] = None
    chart_y_field: Optional[str] = None
    script: Optional[str] = None  # for script reports
    mongo_pipeline: Optional[str] = None  # JSON string — raw MongoDB aggregation pipeline
    is_public: bool = False
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "saved_reports"
        indexes = [
            [("tenant_id", 1), ("app_id", 1)],
        ]


# ── Scheduled (email) report ──────────────────────────────────────────────────

class ScheduledReport(Document):
    """A recurring report that emails model data on a schedule."""
    tenant_id: str
    app_id: str
    model_slug: str
    name: str
    recipients: list[str]             # email addresses
    format: str = "csv"               # csv | pdf
    schedule: str = "daily"           # daily | weekly | monthly
    # For weekly: which day (0=Mon, 6=Sun)
    day_of_week: Optional[int] = None
    # For monthly: day number (1-28)
    day_of_month: Optional[int] = None
    # Celery periodic task info
    is_active: bool = True
    last_sent_at: Optional[datetime] = None
    created_by: str
    created_at: datetime = None
    updated_at: datetime = None

    def __init__(self, **data):
        if data.get("created_at") is None:
            data["created_at"] = datetime.now(tz=timezone.utc)
        if data.get("updated_at") is None:
            data["updated_at"] = datetime.now(tz=timezone.utc)
        super().__init__(**data)

    class Settings:
        name = "scheduled_reports"
        indexes = [
            [("tenant_id", 1), ("app_id", 1)],
            [("is_active", 1)],
        ]
