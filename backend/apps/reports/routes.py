from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status

from apps.reports.models import ScheduledReport, SavedReport, ReportColumn, ReportFilter, ReportSorting
from apps.reports.schemas import ScheduledReportCreate, ScheduledReportResponse, ScheduledReportUpdate
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


# ── SavedReport CRUD ──────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/saved-reports")
async def list_saved_reports(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    reports = await SavedReport.find(
        SavedReport.tenant_id == tenant_id,
        SavedReport.app_id == app_id,
    ).to_list()
    return [r.model_dump(mode="json") for r in reports]


@router.post("/apps/{app_id}/saved-reports", status_code=status.HTTP_201_CREATED)
async def create_saved_report(
    app_id: str,
    body: dict,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    report = SavedReport(
        tenant_id=tenant_id,
        app_id=app_id,
        name=body.get("name", "Untitled Report"),
        description=body.get("description"),
        report_type=body.get("report_type", "query"),
        model_slug=body.get("model_slug", ""),
        columns=[ReportColumn(**c) for c in body.get("columns", [])],
        filters=[ReportFilter(**f) for f in body.get("filters", [])],
        sorting=[ReportSorting(**s) for s in body.get("sorting", [])],
        group_by=body.get("group_by"),
        show_totals=body.get("show_totals", False),
        chart_type=body.get("chart_type"),
        chart_x_field=body.get("chart_x_field"),
        chart_y_field=body.get("chart_y_field"),
        script=body.get("script"),
        mongo_pipeline=body.get("mongo_pipeline"),
        is_public=body.get("is_public", False),
        created_by=str(current_user.id),
    )
    await report.insert()
    return report.model_dump(mode="json")


@router.get("/apps/{app_id}/saved-reports/{report_id}")
async def get_saved_report(
    app_id: str,
    report_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("SavedReport", report_id)
    report = await SavedReport.find_one(
        SavedReport.tenant_id == tenant_id,
        SavedReport.id == oid,
        SavedReport.app_id == app_id,
    )
    if not report:
        raise NotFoundError("SavedReport", report_id)
    return report.model_dump(mode="json")


@router.put("/apps/{app_id}/saved-reports/{report_id}")
async def update_saved_report(
    app_id: str,
    report_id: str,
    body: dict,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "update")),
):
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("SavedReport", report_id)
    report = await SavedReport.find_one(
        SavedReport.tenant_id == tenant_id,
        SavedReport.id == oid,
        SavedReport.app_id == app_id,
    )
    if not report:
        raise NotFoundError("SavedReport", report_id)
    for key in ["name", "description", "columns", "filters", "sorting", "group_by", "show_totals",
                "chart_type", "chart_x_field", "chart_y_field", "script", "mongo_pipeline", "is_public", "model_slug", "report_type"]:
        if key in body:
            val = body[key]
            if key == "columns":
                val = [ReportColumn(**c) for c in val]
            elif key == "filters":
                val = [ReportFilter(**f) for f in val]
            elif key == "sorting":
                val = [ReportSorting(**s) for s in val]
            setattr(report, key, val)
    report.updated_at = datetime.now(tz=timezone.utc)
    await report.save()
    return report.model_dump(mode="json")


@router.delete("/apps/{app_id}/saved-reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_report(
    app_id: str,
    report_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "delete")),
):
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("SavedReport", report_id)
    report = await SavedReport.find_one(
        SavedReport.tenant_id == tenant_id,
        SavedReport.id == oid,
        SavedReport.app_id == app_id,
    )
    if not report:
        raise NotFoundError("SavedReport", report_id)
    await report.delete()


@router.post("/apps/{app_id}/saved-reports/{report_id}/run")
async def run_saved_report(
    app_id: str,
    report_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("SavedReport", report_id)
    report = await SavedReport.find_one(
        SavedReport.tenant_id == tenant_id,
        SavedReport.id == oid,
        SavedReport.app_id == app_id,
    )
    if not report:
        raise NotFoundError("SavedReport", report_id)

    from core.database import get_tenant_db
    db = get_tenant_db(tenant_id)
    collection = db[f"data__{app_id}__{report.model_slug}"]

    match_stage: dict = {"_tenant_id": tenant_id}

    for f in report.filters:
        if f.operator == "=":
            match_stage[f.field] = f.value
        elif f.operator == "!=":
            match_stage[f.field] = {"$ne": f.value}
        elif f.operator == ">":
            match_stage[f.field] = {"$gt": f.value}
        elif f.operator == "<":
            match_stage[f.field] = {"$lt": f.value}
        elif f.operator == ">=":
            match_stage[f.field] = {"$gte": f.value}
        elif f.operator == "<=":
            match_stage[f.field] = {"$lte": f.value}
        elif f.operator == "like":
            match_stage[f.field] = {"$regex": str(f.value).replace("%", ".*"), "$options": "i"}
        elif f.operator == "in":
            match_stage[f.field] = {"$in": f.value if isinstance(f.value, list) else [f.value]}
        elif f.operator == "not in":
            match_stage[f.field] = {"$nin": f.value if isinstance(f.value, list) else [f.value]}
        elif f.operator == "is set":
            match_stage[f.field] = {"$exists": True, "$ne": None}
        elif f.operator == "is not set":
            match_stage[f.field] = {"$in": [None, ""]}

    pipeline: list = [{"$match": match_stage}]

    # ── Script report: execute Python and return result ───────────────────────
    if report.report_type == "script" and report.script:
        safe_builtins = {
            "len": len, "range": range, "list": list, "dict": dict, "set": set,
            "str": str, "int": int, "float": float, "bool": bool, "round": round,
            "min": min, "max": max, "sum": sum, "sorted": sorted, "enumerate": enumerate,
            "zip": zip, "map": map, "filter": filter, "any": any, "all": all,
            "isinstance": isinstance, "print": print, "abs": abs,
        }
        local_vars: dict = {
            "db": db,
            "tenant_id": tenant_id,
            "app_id": app_id,
            "model_slug": report.model_slug,
            "collection": collection,
            "result": [],
        }
        try:
            exec(report.script, {"__builtins__": safe_builtins}, local_vars)  # noqa: S102
        except Exception as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Script error: {exc}")
        rows = local_vars.get("result", [])
        for row in rows:
            if "_id" in row:
                row["id"] = str(row.pop("_id"))
        columns = [c.model_dump() for c in report.columns] if report.columns else []
        return {"rows": rows, "total_rows": len(rows), "columns": columns, "totals": {}}

    # ── Mongo pipeline report: execute raw aggregation pipeline ───────────────
    if report.report_type == "mongo" and report.mongo_pipeline:
        import json
        try:
            user_pipeline = json.loads(report.mongo_pipeline)
        except Exception as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Invalid JSON pipeline: {exc}")
        if not isinstance(user_pipeline, list):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Pipeline must be a JSON array of stages.")
        # Prepend mandatory tenant filter
        full_pipeline = [{"$match": {"tenant_id": tenant_id}}] + user_pipeline
        full_pipeline.append({"$limit": 1000})
        try:
            rows = await collection.aggregate(full_pipeline).to_list(1000)
        except Exception as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Aggregation error: {exc}")
        for row in rows:
            if "_id" in row:
                row["id"] = str(row.pop("_id"))
        columns = [c.model_dump() for c in report.columns] if report.columns else []
        return {"rows": rows, "total_rows": len(rows), "columns": columns, "totals": {}}

    # ── Query report ──────────────────────────────────────────────────────────
    if report.sorting:
        sort_stage = {s.field: 1 if s.direction == "asc" else -1 for s in report.sorting}
        pipeline.append({"$sort": sort_stage})
    else:
        pipeline.append({"$sort": {"created_at": -1}})

    # ── Group by ──────────────────────────────────────────────────────────────
    if report.group_by:
        group_id = f"${report.group_by}"
        group_stage: dict = {"_id": group_id, report.group_by: {"$first": f"${report.group_by}"}}
        for col in report.columns:
            if col.field == report.group_by:
                continue
            agg = col.aggregate
            if agg == "sum":
                group_stage[col.field] = {"$sum": f"${col.field}"}
            elif agg == "avg":
                group_stage[col.field] = {"$avg": f"${col.field}"}
            elif agg == "count":
                group_stage[col.field] = {"$sum": 1}
            elif agg == "min":
                group_stage[col.field] = {"$min": f"${col.field}"}
            elif agg == "max":
                group_stage[col.field] = {"$max": f"${col.field}"}
            else:
                group_stage[col.field] = {"$first": f"${col.field}"}
        pipeline.append({"$group": group_stage})
        # Sort grouped results by the group_by field
        pipeline.append({"$sort": {report.group_by: 1}})
    elif report.columns:
        project = {col.field: 1 for col in report.columns}
        project["_id"] = 1
        pipeline.append({"$project": project})

    pipeline.append({"$limit": 1000})

    cursor = collection.aggregate(pipeline)
    rows = await cursor.to_list(length=1000)

    for row in rows:
        if "_id" in row:
            row["id"] = str(row.pop("_id"))

    totals: dict = {}
    if report.show_totals:
        for col in report.columns:
            if col.aggregate in ("sum", "avg", "count", "min", "max"):
                vals = [r.get(col.field) for r in rows if r.get(col.field) is not None]
                if col.aggregate == "sum":
                    totals[col.field] = sum(float(v) for v in vals if v is not None)
                elif col.aggregate == "avg":
                    totals[col.field] = sum(float(v) for v in vals if v is not None) / len(vals) if vals else 0
                elif col.aggregate == "count":
                    totals[col.field] = len(vals)
                elif col.aggregate == "min":
                    totals[col.field] = min(float(v) for v in vals if v is not None) if vals else None
                elif col.aggregate == "max":
                    totals[col.field] = max(float(v) for v in vals if v is not None) if vals else None

    return {
        "rows": rows,
        "total_rows": len(rows),
        "columns": [c.model_dump() for c in report.columns],
        "totals": totals,
    }


def _to_response(r: ScheduledReport) -> ScheduledReportResponse:
    return ScheduledReportResponse(
        id=str(r.id),
        tenant_id=r.tenant_id,
        app_id=r.app_id,
        model_slug=r.model_slug,
        name=r.name,
        recipients=r.recipients,
        format=r.format,
        schedule=r.schedule,
        day_of_week=r.day_of_week,
        day_of_month=r.day_of_month,
        is_active=r.is_active,
        last_sent_at=r.last_sent_at,
        created_by=r.created_by,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.get("/apps/{app_id}/reports", response_model=list[ScheduledReportResponse])
async def list_reports(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    reports = await ScheduledReport.find(
        ScheduledReport.app_id == app_id,
        ScheduledReport.tenant_id == tenant_id,
    ).to_list()
    return [_to_response(r) for r in reports]


@router.post("/apps/{app_id}/reports", response_model=ScheduledReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    app_id: str,
    payload: ScheduledReportCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("apps", "update")),
):
    r = ScheduledReport(
        tenant_id=tenant_id,
        app_id=app_id,
        created_by=str(current_user.id),
        **payload.model_dump(),
    )
    await r.insert()
    return _to_response(r)


@router.put("/apps/{app_id}/reports/{report_id}", response_model=ScheduledReportResponse)
async def update_report(
    app_id: str,
    report_id: str,
    payload: ScheduledReportUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("Report", report_id)
    r = await ScheduledReport.get(oid)
    if not r or r.app_id != app_id or r.tenant_id != tenant_id:
        raise NotFoundError("Report", report_id)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(r, k, v)
    r.updated_at = datetime.now(tz=timezone.utc)
    await r.save()
    return _to_response(r)


@router.delete("/apps/{app_id}/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    app_id: str,
    report_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("Report", report_id)
    r = await ScheduledReport.get(oid)
    if not r or r.app_id != app_id or r.tenant_id != tenant_id:
        raise NotFoundError("Report", report_id)
    await r.delete()


@router.post("/apps/{app_id}/reports/{report_id}/send-now", status_code=status.HTTP_202_ACCEPTED)
async def send_report_now(
    app_id: str,
    report_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    """Trigger an immediate send (test/manual)."""
    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        raise NotFoundError("Report", report_id)
    r = await ScheduledReport.get(oid)
    if not r or r.app_id != app_id or r.tenant_id != tenant_id:
        raise NotFoundError("Report", report_id)
    from celery_worker import celery_app
    task = celery_app.send_task("apps.reports.tasks.send_scheduled_report", args=[report_id])
    return {"status": "queued", "task_id": task.id}
