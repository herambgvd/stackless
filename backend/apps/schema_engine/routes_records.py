from __future__ import annotations

from fastapi import APIRouter, Body, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel
import asyncio
import json

from apps.schema_engine.repository import get_model_by_slug
from apps.schema_engine.schemas import (
    BulkRecordUpdate,
    DynamicRecordCreate,
    DynamicRecordUpdate,
    PaginatedRecordsResponse,
)
from apps.schema_engine.service import (
    create_record,
    get_record,
    update_record,
    delete_record,
    list_records,
)
from apps.audit.models import AuditLog
from apps.schema_engine.doc_perm import assert_model_permission, get_user_perm_level, get_row_level_filters, mask_record_fields
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError, ValidationError

router = APIRouter()


# ── Dynamic Records ────────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/{model_slug}/records", response_model=PaginatedRecordsResponse)
async def list_records_endpoint(
    app_id: str,
    model_slug: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_field: str = Query("created_at", pattern=r"^[a-zA-Z_][a-zA-Z0-9_.]{0,63}$"),
    sort_dir: int = Query(-1, ge=-1, le=1),
    # Legacy single-field equality filter (kept for backwards compat)
    filter_field: str | None = Query(None, pattern=r"^[a-zA-Z][a-zA-Z0-9_.]{0,63}$"),
    filter_value: str | None = Query(None),
    # Multi-condition filter as JSON string: [{"field":"status","operator":"equals","value":"active"}]
    filters: str | None = Query(None),
    # Full-text search
    search: str | None = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "read")),
):
    model = await get_model_by_slug(model_slug, app_id)
    max_perm_level = 9
    row_filters: list[dict] = []
    if model:
        assert_model_permission(model, current_user, "read")
        max_perm_level = get_user_perm_level(model, current_user)
        row_filters = get_row_level_filters(model, current_user)

    parsed_filters: list[dict] | dict | None = None
    if filters:
        try:
            parsed_filters = json.loads(filters)
        except Exception:
            parsed_filters = None
    elif filter_field and filter_value:
        # Legacy: convert to new format
        parsed_filters = [{"field": filter_field, "operator": "equals", "value": filter_value}]

    # Merge row-level security filters (AND logic — appended to any user-supplied filters)
    if row_filters:
        rls = [{"field": k, "operator": "equals", "value": v} for d in row_filters for k, v in d.items()]
        if isinstance(parsed_filters, list):
            parsed_filters = parsed_filters + rls
        else:
            parsed_filters = rls

    result = await list_records(
        model_slug=model_slug,
        app_id=app_id,
        tenant_id=tenant_id,
        page=page,
        page_size=page_size,
        sort_field=sort_field,
        sort_dir=sort_dir,
        filters=parsed_filters,
        search=search,
    )
    if model and max_perm_level < 9:
        result.items = [mask_record_fields(item, model, max_perm_level) for item in result.items]
    return result


@router.post(
    "/apps/{app_id}/{model_slug}/records",
    status_code=status.HTTP_201_CREATED,
)
async def create_record_endpoint(
    app_id: str,
    model_slug: str,
    payload: DynamicRecordCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "create")
    record = await create_record(model_slug, app_id, tenant_id, payload.data, user_id=str(current_user.id))
    from core.websocket_manager import ws_manager
    asyncio.create_task(ws_manager.broadcast_to_tenant(tenant_id, {
        "type": "doc_changed", "app_id": app_id, "model_slug": model_slug,
        "record_id": record.get("id", ""), "action": "create",
    }))
    return record


# ── Import / Export ────────────────────────────────────────────────────────────
# These must be registered BEFORE /{record_id} routes so literal path segments
# "export" and "import" are not captured as a record_id parameter.

@router.get("/apps/{app_id}/{model_slug}/records/import-template")
async def import_template_endpoint(
    app_id: str,
    model_slug: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    _=Depends(require_permission("records", "read")),
):
    from apps.schema_engine.import_export import generate_import_template
    return await generate_import_template(model_slug, app_id, format)


@router.get("/apps/{app_id}/{model_slug}/records/import-hints")
async def import_hints_endpoint(
    app_id: str,
    model_slug: str,
    _=Depends(require_permission("records", "read")),
):
    from apps.schema_engine.import_export import get_field_type_hints
    return await get_field_type_hints(model_slug, app_id)


class GoogleSheetImportRequest(BaseModel):
    sheet_url: str
    column_map: dict[str, str] | None = None


@router.post("/apps/{app_id}/{model_slug}/records/import-google-sheet")
async def import_google_sheet_endpoint(
    app_id: str,
    model_slug: str,
    payload: GoogleSheetImportRequest,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """Import records from a Google Sheets URL.

    Step 1: Send { sheet_url } without column_map → returns headers for mapping.
    Step 2: Send { sheet_url, column_map } → imports records.
    """
    from apps.schema_engine.import_export import import_google_sheet
    try:
        return await import_google_sheet(
            model_slug=model_slug,
            app_id=app_id,
            tenant_id=tenant_id,
            sheet_url=payload.sheet_url,
            user_id=str(current_user.id),
            column_map=payload.column_map,
        )
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/apps/{app_id}/{model_slug}/records/export")
async def export_records_endpoint(
    app_id: str,
    model_slug: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    from apps.schema_engine.import_export import export_csv, export_xlsx
    if format == "xlsx":
        return await export_xlsx(model_slug, app_id, tenant_id)
    return await export_csv(model_slug, app_id, tenant_id)


@router.post("/apps/{app_id}/{model_slug}/records/import", status_code=status.HTTP_200_OK)
async def import_records_endpoint(
    app_id: str,
    model_slug: str,
    file: UploadFile = File(...),
    column_map: str = Form(None),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    from apps.schema_engine.import_export import import_csv
    col_map = json.loads(column_map) if column_map else None
    return await import_csv(
        model_slug=model_slug,
        app_id=app_id,
        tenant_id=tenant_id,
        file=file,
        user_id=str(current_user.id),
        column_map=col_map,
    )


@router.get("/apps/{app_id}/{model_slug}/records/fixtures")
async def export_fixtures(
    app_id: str,
    model_slug: str,
    limit: int = Query(1000, ge=1, le=10000),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """Export all records as a JSON fixtures file (reference data for seeding)."""
    from fastapi.responses import Response
    from apps.schema_engine.repository import list_dynamic_records

    records, _ = await list_dynamic_records(
        model_slug=model_slug,
        tenant_id=tenant_id,
        app_id=app_id,
        skip=0,
        limit=limit,
    )
    # Strip internal metadata fields that shouldn't be in fixtures
    clean = []
    for r in records:
        clean.append({k: v for k, v in r.items() if not k.startswith("_id") and k not in ("tenant_id",)})

    fixture = {
        "model_slug": model_slug,
        "app_id": app_id,
        "records": clean,
        "count": len(clean),
    }
    return Response(
        content=json.dumps(fixture, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{model_slug}_fixtures.json"'},
    )


@router.post("/apps/{app_id}/{model_slug}/records/fixtures", status_code=status.HTTP_200_OK)
async def import_fixtures(
    app_id: str,
    model_slug: str,
    file: UploadFile = File(...),
    on_conflict: str = Query("skip", pattern="^(skip|update)$"),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """
    Import records from a JSON fixtures file.
    `on_conflict=skip` — skip records that already have the same _name.
    `on_conflict=update` — update existing records with same _name.
    """
    from apps.schema_engine.service import create_record, update_record
    from apps.schema_engine.repository import list_dynamic_records

    raw = await file.read()
    try:
        fixture = json.loads(raw)
    except Exception:
        raise ValidationError("Invalid JSON fixture file")

    records = fixture.get("records", [])
    if not isinstance(records, list):
        raise ValidationError("Fixture must have a 'records' list")

    imported = 0
    skipped = 0
    updated = 0
    errors = []

    # Build existing name index for conflict detection
    existing, _ = await list_dynamic_records(model_slug, tenant_id, app_id, skip=0, limit=100000)
    existing_names = {r.get("_name"): r.get("id") for r in existing if r.get("_name")}

    user_id = str(current_user.id)
    for i, rec in enumerate(records):
        try:
            rec_name = rec.get("_name")
            if rec_name and rec_name in existing_names:
                if on_conflict == "skip":
                    skipped += 1
                    continue
                elif on_conflict == "update":
                    await update_record(model_slug, app_id, tenant_id, existing_names[rec_name], rec, user_id=user_id)
                    updated += 1
                    continue
            await create_record(model_slug, app_id, tenant_id, rec, user_id=user_id)
            imported += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    return {
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total": len(records),
    }


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/recompute-rollups")
async def recompute_record_rollups(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Manually trigger rollup recomputation for a record's parent relationships."""
    from apps.schema_engine.rollup import recompute_rollups_for_parent
    from apps.schema_engine.service import get_record
    record = await get_record(model_slug, app_id, tenant_id, record_id)
    if not record:
        raise NotFoundError("Record", record_id)
    await recompute_rollups_for_parent(model_slug, record, tenant_id, app_id)
    return {"recomputed": True}


@router.get("/apps/{app_id}/{model_slug}/records/{record_id}")
async def get_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "read")),
):
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "read")
    record = await get_record(model_slug, app_id, tenant_id, record_id)
    if model:
        # Enforce row-level security: verify record matches user-permission conditions
        row_filters = get_row_level_filters(model, current_user)
        if row_filters:
            for cond in row_filters:
                for field_name, required_value in cond.items():
                    if str(record.get(field_name, "")) != str(required_value):
                        from core.exceptions import ForbiddenError
                        raise ForbiddenError("You do not have access to this record.")
        record = mask_record_fields(record, model, get_user_perm_level(model, current_user))
    return record


@router.put("/apps/{app_id}/{model_slug}/records/{record_id}")
async def update_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    payload: DynamicRecordUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "write")
    result = await update_record(model_slug, app_id, tenant_id, record_id, payload.data, user_id=str(current_user.id))
    from core.websocket_manager import ws_manager
    asyncio.create_task(ws_manager.broadcast_to_tenant(tenant_id, {
        "type": "doc_changed", "app_id": app_id, "model_slug": model_slug,
        "record_id": record_id, "action": "update",
    }))
    return result


@router.delete(
    "/apps/{app_id}/{model_slug}/records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "delete")),
):
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "delete")
    await delete_record(model_slug, app_id, tenant_id, record_id, user_id=str(current_user.id))
    from core.websocket_manager import ws_manager
    asyncio.create_task(ws_manager.broadcast_to_tenant(tenant_id, {
        "type": "doc_changed", "app_id": app_id, "model_slug": model_slug,
        "record_id": record_id, "action": "delete",
    }))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/lock")
async def lock_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Lock a record to prevent any further edits."""
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "write")
    return await update_record(model_slug, app_id, tenant_id, record_id, {"_is_locked": True}, user_id=str(current_user.id))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/unlock")
async def unlock_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Unlock a previously locked record."""
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "write")
    return await update_record(model_slug, app_id, tenant_id, record_id, {"_is_locked": False}, user_id=str(current_user.id))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """Create a copy of a record. File fields and meta-fields (_owner, _docstatus, _name) are stripped."""
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "create")
    original = await get_record(model_slug, app_id, tenant_id, record_id)
    # Strip meta-fields, file fields, and computed fields — copy only editable data fields
    from apps.schema_engine.models import FieldType
    file_fields = {f.name for f in (model.fields if model else []) if f.type == FieldType.FILE}
    formula_fields = {f.name for f in (model.fields if model else []) if f.type in (FieldType.FORMULA, FieldType.ROLLUP)}
    copy_data = {
        k: v for k, v in original.items()
        if not k.startswith("_")
        and k not in ("id", "created_at", "updated_at")
        and k not in file_fields
        and k not in formula_fields
    }
    return await create_record(model_slug, app_id, tenant_id, copy_data, user_id=str(current_user.id))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/clone", status_code=status.HTTP_201_CREATED)
async def clone_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """Deep-clone a record: copies all data, resets meta-fields, inserts as a new Draft record."""
    import copy
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "create")
    original = await get_record(model_slug, app_id, tenant_id, record_id)
    if not original:
        raise NotFoundError("Record", record_id)
    # Deep copy all data then strip/reset identity and lifecycle fields
    copy_data = copy.deepcopy(dict(original))
    for key in ("id", "_id", "created_at", "updated_at", "_docstatus", "name", "_name"):
        copy_data.pop(key, None)
    copy_data["_docstatus"] = 0  # reset to Draft
    return await create_record(model_slug, app_id, tenant_id, copy_data, user_id=str(current_user.id))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/assign")
async def assign_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    payload: dict = Body(...),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Assign a record to a user. Accepts user_id, note, due_date. Pass user_id=null to unassign."""
    assigned_to = payload.get("user_id")  # None = unassign
    note = payload.get("note") or None
    due_date = payload.get("due_date") or None
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "write")
    update_data: dict = {"_assigned_to": assigned_to, "_assign_note": note, "_assign_due_date": due_date}
    result = await update_record(
        model_slug, app_id, tenant_id, record_id,
        update_data,
        user_id=str(current_user.id),
    )

    # Notify the newly assigned user (best-effort, respects preferences)
    if assigned_to and assigned_to != str(current_user.id):
        try:
            from apps.notifications.service import send_notification
            from apps.notifications.models import NotificationChannel
            from apps.notifications.preferences import NotificationPreference
            assigner_name = getattr(current_user, "full_name", None) or str(current_user.id)
            model_name = model.name if model else model_slug
            pref = await NotificationPreference.find_one(
                NotificationPreference.user_id == assigned_to,
                NotificationPreference.tenant_id == tenant_id,
            )
            send_inapp = pref.inapp_assignments if pref else True
            send_email = pref.email_assignments if pref else True
            if send_inapp:
                await send_notification(
                    channel=NotificationChannel.IN_APP,
                    recipient=assigned_to,
                    template_id=None,
                    notification_context={},
                    tenant_id=tenant_id,
                    subject="Record assigned to you",
                    body=f"{assigner_name} assigned a {model_name} record to you." + (f" Note: {note}" if note else "") + (f" Due: {due_date}" if due_date else ""),
                )
            if send_email:
                await send_notification(
                    channel=NotificationChannel.EMAIL,
                    recipient=assigned_to,
                    template_id=None,
                    notification_context={},
                    tenant_id=tenant_id,
                    subject=f"[Stackless] Record assigned to you by {assigner_name}",
                    body=f"{assigner_name} assigned a {model_name} record to you." + (f" Note: {note}" if note else "") + (f" Due: {due_date}" if due_date else ""),
                )
        except Exception:
            pass

    return result


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/submit")
async def submit_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "submit")),
):
    """Submit a record — locks it (docstatus = 1). Only valid from Draft (0)."""
    from apps.schema_engine.service import set_record_docstatus
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "submit")
    return await set_record_docstatus(model_slug, app_id, tenant_id, record_id, 1, str(current_user.id))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/cancel")
async def cancel_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "cancel")),
):
    """Cancel a submitted record (docstatus = 2). Only valid from Submitted (1)."""
    from apps.schema_engine.service import set_record_docstatus
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "submit")
    return await set_record_docstatus(model_slug, app_id, tenant_id, record_id, 2, str(current_user.id))


@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/amend")
async def amend_record_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """Amend a cancelled record — creates a new Draft copy linked to the original."""
    from apps.schema_engine.service import amend_record
    model = await get_model_by_slug(model_slug, app_id)
    if model:
        assert_model_permission(model, current_user, "create")
    return await amend_record(model_slug, app_id, tenant_id, record_id, str(current_user.id))


@router.patch("/apps/{app_id}/{model_slug}/records/bulk")
async def bulk_update_records_endpoint(
    app_id: str,
    model_slug: str,
    payload: BulkRecordUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Apply the same field updates to multiple records at once."""
    updated = 0
    errors = 0
    for record_id in payload.record_ids:
        try:
            await update_record(
                model_slug, app_id, tenant_id, record_id,
                payload.data,
                user_id=str(current_user.id),
            )
            updated += 1
        except Exception:
            errors += 1
    return {"updated": updated, "errors": errors, "total": len(payload.record_ids)}


# ── Audit ─────────────────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/{model_slug}/records/{record_id}/audit")
async def get_record_audit_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    skip = (page - 1) * page_size
    logs = await AuditLog.find(
        AuditLog.tenant_id == tenant_id,
        AuditLog.record_id == record_id,
    ).sort(-AuditLog.created_at).skip(skip).limit(page_size).to_list()

    return [
        {
            "id": str(log.id),
            "action": log.action,
            "user_id": log.user_id,
            "changes": log.changes,
            "created_at": log.created_at.isoformat().replace("+00:00", "Z"),
        }
        for log in logs
    ]


# ── File Uploads ───────────────────────────────────────────────────────────────

@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/files/{field_name}")
async def upload_file_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    field_name: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Upload a file for a FILE-type field on a record. Returns file metadata."""
    from core.storage import upload_file as storage_upload
    from apps.schema_engine.service import get_record, update_record
    from apps.schema_engine.models import FieldType

    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)

    field_def = next((f for f in model.fields if f.name == field_name), None)
    if field_def is None:
        raise ValidationError(f"Field '{field_name}' does not exist on model '{model_slug}'.")
    if field_def.type != FieldType.FILE:
        raise ValidationError(f"Field '{field_name}' is not a FILE field.")

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"

    from core.config import get_settings as _get_cfg
    _cfg = _get_cfg()
    max_bytes = _cfg.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise ValidationError(
            f"File too large. Maximum allowed size is {_cfg.MAX_UPLOAD_SIZE_MB} MB "
            f"(uploaded {len(content) / (1024 * 1024):.1f} MB)."
        )

    # Save current file as a version before overwriting
    from apps.schema_engine.models import FileVersion
    existing_record = await get_record(model_slug, app_id, tenant_id, record_id)
    existing_data = existing_record.get("data", existing_record)
    existing_file = existing_data.get(field_name)
    if existing_file and isinstance(existing_file, dict) and existing_file.get("key"):
        # Determine the next version number
        version_count = await FileVersion.find(
            FileVersion.tenant_id == tenant_id,
            FileVersion.record_id == record_id,
            FileVersion.field_name == field_name,
        ).count()
        await FileVersion(
            tenant_id=tenant_id,
            app_id=app_id,
            model_slug=model_slug,
            record_id=record_id,
            field_name=field_name,
            version=version_count + 1,
            key=existing_file["key"],
            filename=existing_file.get("filename", ""),
            content_type=existing_file.get("content_type", "application/octet-stream"),
            size=existing_file.get("size", 0),
            uploaded_by=str(current_user.id),
        ).insert()

    metadata = await storage_upload(
        file_bytes=content,
        content_type=content_type,
        original_filename=file.filename or "upload",
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug=model_slug,
    )

    # Update the record's field value with file metadata
    await update_record(
        model_slug, app_id, tenant_id, record_id,
        {field_name: metadata},
        user_id=str(current_user.id),
    )
    return metadata


@router.get("/apps/{app_id}/{model_slug}/records/{record_id}/files/{field_name}/versions")
async def list_file_versions_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    field_name: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """List all previous versions of a FILE field for a record."""
    from apps.schema_engine.models import FileVersion
    versions = await FileVersion.find(
        FileVersion.tenant_id == tenant_id,
        FileVersion.record_id == record_id,
        FileVersion.field_name == field_name,
    ).sort(-FileVersion.version).to_list()
    return [
        {
            "id": str(v.id),
            "version": v.version,
            "filename": v.filename,
            "content_type": v.content_type,
            "size": v.size,
            "uploaded_by": v.uploaded_by,
            "uploaded_at": v.uploaded_at.isoformat().replace("+00:00", "Z"),
        }
        for v in versions
    ]


@router.get("/apps/{app_id}/{model_slug}/records/{record_id}/files/{field_name}/versions/{version_id}/url")
async def get_file_version_url_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    field_name: str,
    version_id: str,
    expires: int = Query(3600, ge=60, le=86400),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """Get a presigned download URL for a specific previous version of a FILE field."""
    from apps.schema_engine.models import FileVersion
    from beanie import PydanticObjectId
    from core.storage import get_presigned_url
    try:
        oid = PydanticObjectId(version_id)
    except Exception:
        raise NotFoundError("FileVersion", version_id)
    version = await FileVersion.get(oid)
    if not version or version.tenant_id != tenant_id or version.record_id != record_id:
        raise NotFoundError("FileVersion", version_id)
    url = await get_presigned_url(version.key, expires_seconds=expires)
    return {"url": url, "filename": version.filename, "version": version.version, "expires_in": expires}


@router.get("/apps/{app_id}/{model_slug}/records/{record_id}/files/{field_name}/url")
async def get_file_url_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    field_name: str,
    expires: int = Query(3600, ge=60, le=86400),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """Get a presigned download URL for a FILE field value."""
    from core.storage import get_presigned_url
    from apps.schema_engine.service import get_record

    record = await get_record(model_slug, app_id, tenant_id, record_id)
    data = record.get("data", record)
    file_meta = data.get(field_name)
    if not file_meta or not isinstance(file_meta, dict) or "key" not in file_meta:
        raise NotFoundError("File", field_name)

    url = await get_presigned_url(file_meta["key"], expires_seconds=expires)
    return {"url": url, "filename": file_meta.get("filename"), "expires_in": expires}


@router.delete("/apps/{app_id}/{model_slug}/records/{record_id}/files/{field_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file_endpoint(
    app_id: str,
    model_slug: str,
    record_id: str,
    field_name: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Delete the file stored in a FILE field and clear the field value."""
    from core.storage import delete_file as storage_delete
    from apps.schema_engine.service import get_record, update_record

    record = await get_record(model_slug, app_id, tenant_id, record_id)
    data = record.get("data", record)
    file_meta = data.get(field_name)
    if file_meta and isinstance(file_meta, dict) and "key" in file_meta:
        await storage_delete(file_meta["key"])

    await update_record(
        model_slug, app_id, tenant_id, record_id,
        {field_name: None},
        user_id=str(current_user.id),
    )


# ── Version Restore ────────────────────────────────────────────────────────────

@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/restore/{audit_log_id}")
async def restore_record_version(
    app_id: str,
    model_slug: str,
    record_id: str,
    audit_log_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Restore a record to the state captured in an audit log snapshot."""
    from apps.audit.models import AuditLog
    from beanie import PydanticObjectId

    try:
        oid = PydanticObjectId(audit_log_id)
    except Exception:
        raise NotFoundError("AuditLog", audit_log_id)

    log = await AuditLog.get(oid)
    if not log or log.tenant_id != tenant_id or log.record_id != record_id:
        raise NotFoundError("AuditLog", audit_log_id)

    if not log.snapshot:
        raise ValidationError("This audit log entry has no snapshot to restore from.")

    # Restore: apply the snapshot as an update (exclude internal meta fields)
    restore_data = {
        k: v for k, v in log.snapshot.items()
        if not k.startswith("_id") and k not in ("id",)
    }
    restored = await update_record(
        model_slug=model_slug,
        app_id=app_id,
        tenant_id=tenant_id,
        record_id=record_id,
        data=restore_data,
        user_id=str(current_user.id),
    )
    return {"message": "Record restored to previous version", "record": restored}


# ── PDF Reports ────────────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/{model_slug}/records/report.pdf")
async def export_pdf_report_endpoint(
    app_id: str,
    model_slug: str,
    title: str = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    from apps.schema_engine.pdf_service import generate_pdf_report
    return await generate_pdf_report(model_slug, app_id, tenant_id, title=title)
