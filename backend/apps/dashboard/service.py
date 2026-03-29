from __future__ import annotations

from typing import Optional, Any
from datetime import datetime, timezone

from apps.dashboard.models import DashboardWidget
from core.database import get_motor_client
from core.config import get_settings


def _collection_name(tenant_id: str, app_id: str, model_slug: str) -> str:
    return f"data__{tenant_id}__{app_id}__{model_slug}"


async def _get_widget_data(
    widget: DashboardWidget,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> Any:
    settings = get_settings()
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]
    col = db[_collection_name(widget.tenant_id, widget.app_id, widget.model_slug)]

    # Base match
    match: dict = {"tenant_id": widget.tenant_id}
    if widget.filter_field and widget.filter_value is not None:
        match[f"data.{widget.filter_field}"] = widget.filter_value

    # Date-range filter
    if (date_from or date_to) and widget.date_field:
        date_key = widget.date_field if widget.date_field == "created_at" else f"data.{widget.date_field}"
        date_filter: dict = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        match[date_key] = date_filter

    if widget.widget_type == "kpi":
        # Single aggregate value
        if widget.aggregate_fn == "count" or not widget.aggregate_field:
            count = await col.count_documents(match)
            return count
        else:
            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": None,
                    "value": {f"${widget.aggregate_fn}": f"$data.{widget.aggregate_field}"},
                }},
            ]
            docs = await col.aggregate(pipeline).to_list(1)
            return round(docs[0]["value"], 2) if docs else 0

    elif widget.widget_type in ("bar", "line", "pie", "donut"):
        if not widget.group_by_field:
            # Fallback: monthly counts using date_field
            date_field = widget.date_field or "created_at"
            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": {
                        "year": {"$year": f"${date_field}" if date_field == "created_at" else f"$data.{date_field}"},
                        "month": {"$month": f"${date_field}" if date_field == "created_at" else f"$data.{date_field}"},
                    },
                    "value": {"$sum": 1} if widget.aggregate_fn == "count"
                              else {f"${widget.aggregate_fn}": f"$data.{widget.aggregate_field}"},
                }},
                {"$sort": {"_id.year": 1, "_id.month": 1}},
                {"$limit": 12},
            ]
            docs = await col.aggregate(pipeline).to_list(None)
            months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            return [
                {
                    "label": f"{months[d['_id']['month']-1]} {d['_id']['year']}",
                    "value": round(d["value"], 2) if isinstance(d["value"], float) else d["value"],
                }
                for d in docs
            ]
        else:
            # Group by field values
            agg_expr = {"$sum": 1} if widget.aggregate_fn == "count" else \
                       {f"${widget.aggregate_fn}": f"$data.{widget.aggregate_field}"}
            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": f"$data.{widget.group_by_field}",
                    "value": agg_expr,
                }},
                {"$sort": {"value": -1}},
                {"$limit": 20},
            ]
            docs = await col.aggregate(pipeline).to_list(None)
            return [
                {
                    "label": str(d["_id"]) if d["_id"] is not None else "None",
                    "value": round(d["value"], 2) if isinstance(d["value"], float) else d["value"],
                }
                for d in docs
            ]

    elif widget.widget_type == "heatmap":
        # Calendar heatmap: daily aggregates grouped by date
        date_field = widget.date_field or "created_at"
        date_key = date_field if date_field == "created_at" else f"data.{date_field}"
        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": {
                    "year": {"$year": f"${date_key}"},
                    "month": {"$month": f"${date_key}"},
                    "day": {"$dayOfMonth": f"${date_key}"},
                },
                "value": {"$sum": 1} if widget.aggregate_fn == "count"
                          else {f"${widget.aggregate_fn}": f"$data.{widget.aggregate_field}"},
            }},
            {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
            {"$limit": 366},
        ]
        docs = await col.aggregate(pipeline).to_list(None)
        return [
            {
                "date": f"{d['_id']['year']:04d}-{d['_id']['month']:02d}-{d['_id']['day']:02d}",
                "value": round(d["value"], 2) if isinstance(d["value"], float) else d["value"],
            }
            for d in docs
        ]

    elif widget.widget_type == "funnel":
        # Funnel: group by categorical field, sorted by value descending
        if not widget.group_by_field:
            return []
        agg_expr = (
            {"$sum": 1} if widget.aggregate_fn == "count"
            else {f"${widget.aggregate_fn}": f"$data.{widget.aggregate_field}"}
        )
        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": f"$data.{widget.group_by_field}",
                "value": agg_expr,
            }},
            {"$sort": {"value": -1}},
            {"$limit": 10},
        ]
        docs = await col.aggregate(pipeline).to_list(None)
        return [
            {
                "label": str(d["_id"]) if d["_id"] is not None else "None",
                "value": round(d["value"], 2) if isinstance(d["value"], float) else d["value"],
            }
            for d in docs
        ]

    elif widget.widget_type == "report" and widget.report_id:
        # Report widget: data fetched via the reports run API in the frontend
        # Return a stub so the widget knows which report to load
        return {"report_id": widget.report_id, "app_id": widget.app_id}

    return None


async def get_all_widget_data(
    app_id: str,
    tenant_id: str,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[dict]:
    widgets = await DashboardWidget.find(
        DashboardWidget.app_id == app_id,
        DashboardWidget.tenant_id == tenant_id,
    ).sort(DashboardWidget.order).to_list()

    results = []
    for w in widgets:
        try:
            data = await _get_widget_data(w, date_from=date_from, date_to=date_to)
        except Exception:
            data = None
        results.append({"widget_id": str(w.id), "data": data})
    return results
