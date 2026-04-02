from __future__ import annotations

import re
from typing import Any, Optional

import structlog

log = structlog.get_logger(__name__)

from apps.schema_engine.models import FieldDefinition, FieldType, ModelDefinition
from apps.schema_engine.repository import (
    create_dynamic_record,
    get_dynamic_record,
    get_model_by_slug,
    list_dynamic_records,
    update_dynamic_record,
    delete_dynamic_record,
)
from apps.schema_engine.schemas import PaginatedRecordsResponse
from apps.schema_engine.hooks import (
    _apply_rules,
    _dispatch_record_workflows,
    _run_server_scripts,
    _write_audit_log,
)
from core.database import get_tenant_db
from core.exceptions import NotFoundError, ValidationError


# ── Schema validation ────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"^https?://\S+$", re.IGNORECASE)
_PHONE_RE = re.compile(r"^\+?[\d\s\-().]{6,20}$")


async def validate_record_against_schema(
    data: dict[str, Any],
    model: ModelDefinition,
) -> list[str]:
    errors: list[str] = []
    for field in model.fields:
        # Computed / complex fields — skip standard scalar validation
        if field.type in (FieldType.FORMULA, FieldType.ROLLUP):
            continue

        value = data.get(field.name)

        # Required check
        if field.is_required and (value is None or value == ""):
            errors.append(f"Field '{field.label or field.name}' is required.")
            continue

        if value is None or value == "":
            continue  # Optional and empty – skip type checks

        label = field.label or field.name

        # Type-specific validation
        if field.type in (FieldType.NUMBER, FieldType.CURRENCY):
            try:
                num = float(value)
            except (TypeError, ValueError):
                errors.append(f"Field '{label}' must be a number (got {value!r}).")
                continue
            # Range validation
            if "min" in field.config and num < field.config["min"]:
                errors.append(f"Field '{label}' must be ≥ {field.config['min']}.")
            if "max" in field.config and num > field.config["max"]:
                errors.append(f"Field '{label}' must be ≤ {field.config['max']}.")

        elif field.type == FieldType.BOOLEAN:
            if not isinstance(value, bool):
                errors.append(f"Field '{label}' must be true or false (got {value!r}).")

        elif field.type == FieldType.EMAIL:
            if not _EMAIL_RE.match(str(value)):
                errors.append(f"Field '{label}' must be a valid email address.")

        elif field.type == FieldType.URL:
            if not _URL_RE.match(str(value)):
                errors.append(f"Field '{label}' must be a valid URL (http/https).")

        elif field.type == FieldType.PHONE:
            if not _PHONE_RE.match(str(value)):
                errors.append(f"Field '{label}' must be a valid phone number.")

        elif field.type == FieldType.TEXT:
            s = str(value)
            if "min_length" in field.config and len(s) < field.config["min_length"]:
                errors.append(f"Field '{label}' must be at least {field.config['min_length']} characters.")
            if "max_length" in field.config and len(s) > field.config["max_length"]:
                errors.append(f"Field '{label}' must be at most {field.config['max_length']} characters.")
            if "pattern" in field.config and field.config["pattern"]:
                import re as _re
                try:
                    if not _re.match(field.config["pattern"], s):
                        errors.append(f"Field '{label}' does not match the required pattern.")
                except Exception:
                    pass

        elif field.type == FieldType.SELECT:
            allowed = field.config.get("options", [])
            if allowed and value not in allowed:
                # Tolerant match: case-insensitive + strip whitespace + alphanumeric
                allowed_norm = {
                    "".join(c for c in str(a).strip().lower() if c.isalnum()): a
                    for a in allowed
                }
                val_norm = "".join(c for c in str(value).strip().lower() if c.isalnum())
                if val_norm in allowed_norm:
                    # Auto-correct to the canonical option value
                    data[field.name] = allowed_norm[val_norm]
                else:
                    errors.append(f"Field '{label}' value {value!r} is not in allowed options: {allowed}.")

        elif field.type == FieldType.MULTISELECT:
            allowed = field.config.get("options", [])
            if allowed and isinstance(value, list):
                allowed_norm = {
                    "".join(c for c in str(a).strip().lower() if c.isalnum()): a
                    for a in allowed
                }
                corrected = []
                bad = []
                for v in value:
                    v_norm = "".join(c for c in str(v).strip().lower() if c.isalnum())
                    if v in allowed:
                        corrected.append(v)
                    elif v_norm in allowed_norm:
                        corrected.append(allowed_norm[v_norm])
                    else:
                        bad.append(v)
                if bad:
                    errors.append(f"Field '{label}' contains invalid options: {bad}.")
                else:
                    data[field.name] = corrected

        elif field.type == FieldType.JSON:
            if isinstance(value, str):
                import json as _json
                try:
                    _json.loads(value)
                except Exception:
                    errors.append(f"Field '{label}' must be valid JSON.")

        elif field.type == FieldType.CHILD_TABLE:
            # value must be a list of dicts; validate each row against child_fields
            if not isinstance(value, list):
                errors.append(f"Field '{label}' must be a list of rows.")
            else:
                child_fields = field.config.get("child_fields", [])
                required_child = [f for f in child_fields if f.get("is_required")]
                for i, row in enumerate(value):
                    if not isinstance(row, dict):
                        errors.append(f"Field '{label}' row {i+1} must be an object.")
                        continue
                    for cf in required_child:
                        cf_val = row.get(cf["name"])
                        if cf_val is None or cf_val == "":
                            errors.append(f"'{label}' row {i+1}: '{cf.get('label', cf['name'])}' is required.")

    return errors


# ── Formula fields ───────────────────────────────────────────────────────────

def _compute_formula_fields(data: dict[str, Any], model: ModelDefinition) -> dict[str, Any]:
    """Evaluate FORMULA fields using the safe asteval-based formula engine."""
    formula_fields = [f for f in model.fields if f.type == FieldType.FORMULA]
    if not formula_fields:
        return data

    from apps.formula_engine.engine import evaluate_formula

    result = dict(data)
    for field in formula_fields:
        expression = field.config.get("expression", "")
        if not expression:
            continue
        computed = evaluate_formula(expression, result)
        if computed is not None:
            result[field.name] = computed

    return result


# ── Relation field population ────────────────────────────────────────────────

async def _populate_relation_fields(
    records: list[dict[str, Any]],
    model: ModelDefinition,
) -> list[dict[str, Any]]:
    """Fetch related records for RELATION fields and embed a display object.

    For each RELATION field we collect all referenced IDs from the record batch,
    do a single $in query per unique (target_model_slug, target_app_id) combination,
    then stitch the display value back into each record.
    """
    import logging
    from bson import ObjectId

    log = logging.getLogger(__name__)

    # Field types that make good display candidates (in priority order)
    _DISPLAY_TYPES = {"text", "email", "phone", "url", "number", "select", "currency"}
    # System/internal keys to skip when picking a display value from a raw doc
    _SYSTEM_KEYS = {"_id", "_tenant_id", "_app_id", "_owner", "created_at", "updated_at"}

    relation_fields = [f for f in model.fields if f.type == FieldType.RELATION]
    if not relation_fields or not records:
        return records

    db = get_tenant_db(model.tenant_id)

    # Build lookup map per relation field
    for field in relation_fields:
        cfg = field.config or {}
        target_app_id = cfg.get("target_app_id") or model.app_id
        # Support both target_model_slug and related_model_slug (frontend uses related_model_slug)
        target_model_slug = cfg.get("target_model_slug") or cfg.get("related_model_slug", "")
        display_field = cfg.get("display_field") or "name"

        if not target_model_slug:
            log.warning("Relation field '%s' on model '%s' has no target_model_slug configured", field.name, model.slug)
            continue

        # Resolve target model to get tenant_id for collection name
        target_model = await get_model_by_slug(target_model_slug, target_app_id)
        if target_model is None:
            log.warning(
                "Relation field '%s' on model '%s': target model '%s' not found in app '%s'",
                field.name, model.slug, target_model_slug, target_app_id,
            )
            continue

        # Determine the best display field:
        # 1. Use the configured display_field if it exists on the target model
        # 2. Fall back to the first text-like field from the target model's schema
        target_field_names = {f.name for f in target_model.fields}
        resolved_display_field = display_field
        if display_field not in target_field_names:
            # Pick the first suitable field from the target model definition
            fallback = None
            for tf in sorted(target_model.fields, key=lambda f: f.order):
                if tf.type.value in _DISPLAY_TYPES and tf.name in target_field_names:
                    fallback = tf.name
                    break
            if fallback:
                resolved_display_field = fallback

        # Use the resolved model's own app_id for collection name (authoritative)
        col_name = f"data__{target_model.app_id}__{target_model_slug}"
        col = db[col_name]

        # Collect all non-null IDs referenced by this field across the batch
        raw_ids: list[str] = []
        for rec in records:
            val = rec.get(field.name)
            if val:
                raw_ids.append(str(val))

        if not raw_ids:
            continue

        # Single $in query
        oid_map: dict[str, dict] = {}
        try:
            valid_oids = []
            for rid in set(raw_ids):
                try:
                    valid_oids.append(ObjectId(rid))
                except Exception:
                    pass
            if valid_oids:
                async for doc in col.find({"_id": {"$in": valid_oids}}):
                    oid_map[str(doc["_id"])] = doc
        except Exception:
            log.exception(
                "Relation field '%s' on model '%s': failed to query collection '%s'",
                field.name, model.slug, col_name,
            )

        # Embed display object alongside raw ID
        for rec in records:
            raw_val = rec.get(field.name)
            if not raw_val:
                continue
            raw_id = str(raw_val)
            rec[field.name] = raw_id
            if raw_id in oid_map:
                related = oid_map[raw_id]
                display_val = related.get(resolved_display_field)
                # Last-resort fallback: pick the first non-system string value from the doc
                if not display_val:
                    for k, v in related.items():
                        if k not in _SYSTEM_KEYS and isinstance(v, str) and v:
                            display_val = v
                            break
                rec[f"__{field.name}__"] = {
                    "id": raw_id,
                    "display": str(display_val) if display_val else raw_id,
                }
            else:
                rec[f"__{field.name}__"] = {
                    "id": raw_id,
                    "display": raw_id,
                }

    return records


# ── Record CRUD ──────────────────────────────────────────────────────────────

async def create_record(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    data: dict[str, Any],
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)

    # 1. Schema validation
    errors = await validate_record_against_schema(data, model)
    if errors:
        raise ValidationError("; ".join(errors))

    # 2. Auto-set ownership meta-fields
    if user_id and "_owner" not in data:
        data["_owner"] = user_id  # always set on first create; never overwritten by updates

    # 3. Naming series — auto-generate _name if model has a series configured
    if model.naming_series and "_name" not in data:
        from apps.schema_engine.naming import generate_name
        data["_name"] = await generate_name(model.naming_series, tenant_id, data=data)

    # 4. Compute formula fields
    data = _compute_formula_fields(data, model)

    # 5. Server scripts: before_save hooks
    data = await _run_server_scripts("before_save", model_slug, app_id, tenant_id, data)

    # 6. Rules engine: ON_CREATE rules — validates, computes, and may trigger workflows/approvals
    # record_id is not yet known; pass empty string (actions will fire after save if any)
    data = await _apply_rules(data, model, tenant_id, trigger="on_create", record_id="", app_id=app_id)

    # 7. Save
    record = await create_dynamic_record(model_slug, tenant_id, app_id, data)

    # 8. Server scripts: after_save hooks
    await _run_server_scripts("after_save", model_slug, app_id, tenant_id, {**record})

    # 9. Audit log — field-level diff: each field goes from None to its initial value
    create_diff = {k: {"from": None, "to": v} for k, v in data.items()}
    await _write_audit_log(tenant_id, app_id, model_slug, record["id"], "create", user_id, create_diff)

    # 10. Fire matching workflows (async, non-blocking)
    await _dispatch_record_workflows(str(model.id), app_id, tenant_id, record["id"], "on_create")

    # 7. Fire-and-forget: recompute parent rollups
    try:
        import asyncio
        from apps.schema_engine.rollup import recompute_rollups_for_parent
        asyncio.create_task(
            recompute_rollups_for_parent(model_slug, data, tenant_id, app_id)
        )
    except Exception as exc:
        log.error("Rollup recomputation failed on create", error=str(exc), model_slug=model_slug)

    return record


async def update_record(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
    data: dict[str, Any],
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)

    # Fetch old record for change detection (CHANGED_TO / CHANGED_FROM operators)
    old_record = await get_dynamic_record(model_slug, tenant_id, app_id, record_id)
    if old_record is None:
        raise NotFoundError("Record", record_id)

    # Block edits on submitted records (docstatus=1) — must cancel first
    if model.is_submittable and old_record.get("_docstatus", 0) == 1:
        raise ValidationError("Record is submitted and cannot be edited. Cancel it first.")

    # Block edits on locked records — allow updating _is_locked itself (unlock)
    if old_record.get("_is_locked") and not (list(data.keys()) == ["_is_locked"] and not data["_is_locked"]):
        raise ValidationError("Record is locked. Unlock it before making changes.")

    # 1. Schema validation
    errors = await validate_record_against_schema(data, model)
    if errors:
        raise ValidationError("; ".join(errors))

    # 2. Compute formula fields
    merged_data = {**old_record, **data}
    merged_data = _compute_formula_fields(merged_data, model)
    # Only send the updated fields + any newly computed formulas
    data = {**data, **{k: v for k, v in merged_data.items() if k not in old_record or old_record[k] != v}}

    # 3. Server scripts: before_save hooks
    data = await _run_server_scripts("before_save", model_slug, app_id, tenant_id, data)

    # 4. Rules engine: ON_UPDATE rules
    data = await _apply_rules(data, model, tenant_id, trigger="on_update", record_id=record_id, app_id=app_id, previous_data=old_record)

    # 5. Save
    record = await update_dynamic_record(model_slug, tenant_id, app_id, record_id, data)
    if record is None:
        raise NotFoundError("Record", record_id)

    # 6. Server scripts: after_save hooks (fire & forget)
    await _run_server_scripts("after_save", model_slug, app_id, tenant_id, {**record})

    # 7. Audit log — record which fields changed; store pre-update snapshot for restore
    changes = {
        k: {"from": old_record.get(k), "to": v}
        for k, v in data.items()
        if old_record.get(k) != v
    }
    # Store a clean snapshot of the record BEFORE this update (enables version restore)
    snapshot = {k: v for k, v in old_record.items() if not k.startswith("_id")}
    await _write_audit_log(tenant_id, app_id, model_slug, record_id, "update", user_id, changes, snapshot=snapshot)

    # 8. Fire matching workflows
    await _dispatch_record_workflows(str(model.id), app_id, tenant_id, record_id, "on_update")

    # 7. Fire-and-forget: recompute parent rollups
    try:
        import asyncio
        from apps.schema_engine.rollup import recompute_rollups_for_parent
        # Use merged data so relation fields from old record are preserved
        asyncio.create_task(
            recompute_rollups_for_parent(model_slug, {**old_record, **data}, tenant_id, app_id)
        )
    except Exception as exc:
        log.error("Rollup recomputation failed on update", error=str(exc), model_slug=model_slug)

    return record


async def delete_record(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
    user_id: Optional[str] = None,
) -> None:
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)

    # Fetch record data before deleting so we can recompute parent rollups afterwards
    record_before_delete = await get_dynamic_record(model_slug, tenant_id, app_id, record_id)

    # Block deletion of submitted records
    if model.is_submittable and record_before_delete and record_before_delete.get("_docstatus", 0) == 1:
        raise ValidationError("Record is submitted and cannot be deleted. Cancel it first.")

    # Block deletion of locked records
    if record_before_delete and record_before_delete.get("_is_locked"):
        raise ValidationError("Record is locked. Unlock it before deleting.")

    # before_delete hooks
    await _run_server_scripts("before_delete", model_slug, app_id, tenant_id, record_before_delete or {})

    deleted = await delete_dynamic_record(model_slug, tenant_id, app_id, record_id)
    if not deleted:
        raise NotFoundError("Record", record_id)

    # after_delete hooks
    await _run_server_scripts("after_delete", model_slug, app_id, tenant_id, record_before_delete or {})

    # Audit log — field-level diff: each field goes from its last value to None
    delete_diff = (
        {k: {"from": v, "to": None} for k, v in record_before_delete.items() if not k.startswith("_")}
        if record_before_delete else {}
    )
    await _write_audit_log(tenant_id, app_id, model_slug, record_id, "delete", user_id, delete_diff)

    # Fire ON_DELETE workflows
    await _dispatch_record_workflows(str(model.id), app_id, tenant_id, record_id, "on_delete")

    # Fire-and-forget: recompute parent rollups
    if record_before_delete is not None:
        try:
            import asyncio
            from apps.schema_engine.rollup import recompute_rollups_for_parent
            asyncio.create_task(
                recompute_rollups_for_parent(model_slug, record_before_delete, tenant_id, app_id)
            )
        except Exception as exc:
            log.error("Rollup recomputation failed on delete", error=str(exc), model_slug=model_slug)


async def set_record_docstatus(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
    new_status: int,
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """Transition a record's docstatus: 0=Draft, 1=Submitted, 2=Cancelled.

    Valid transitions:
      0 → 1  (Submit)
      1 → 2  (Cancel)
    """
    from apps.schema_engine.models import DocStatus

    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)
    if not model.is_submittable:
        raise ValidationError("This model does not support Submit/Cancel workflow.")

    record = await get_dynamic_record(model_slug, tenant_id, app_id, record_id)
    if record is None:
        raise NotFoundError("Record", record_id)

    current_status = record.get("_docstatus", 0)
    valid = {0: 1, 1: 2}  # allowed transitions
    if valid.get(current_status) != new_status:
        status_names = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
        raise ValidationError(
            f"Cannot transition from {status_names[current_status]} to {status_names[new_status]}."
        )

    updated = await update_dynamic_record(
        model_slug, tenant_id, app_id, record_id, {"_docstatus": new_status}
    )
    action_name = {1: "submit", 2: "cancel"}[new_status]
    await _write_audit_log(tenant_id, app_id, model_slug, record_id, action_name, user_id,
                           {"_docstatus": {"from": current_status, "to": new_status}})
    return updated


async def amend_record(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """Create a new Draft copy of a Cancelled record, linked via _amended_from."""
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)
    if not model.is_submittable:
        raise ValidationError("This model does not support Amend workflow.")

    original = await get_dynamic_record(model_slug, tenant_id, app_id, record_id)
    if original is None:
        raise NotFoundError("Record", record_id)
    if original.get("_docstatus", 0) != 2:
        raise ValidationError("Only Cancelled records can be amended.")

    # Copy data fields, reset meta-fields
    new_data = {
        k: v for k, v in original.items()
        if not k.startswith("_") and k not in ("id", "created_at", "updated_at")
    }
    new_data["_docstatus"] = 0
    new_data["_amended_from"] = record_id

    new_record = await create_dynamic_record(model_slug, tenant_id, app_id, new_data)
    await _write_audit_log(tenant_id, app_id, model_slug, new_record["id"], "amend", user_id,
                           {"_amended_from": {"from": None, "to": record_id}})
    return new_record


async def get_record(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
) -> dict[str, Any]:
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)
    record = await get_dynamic_record(model_slug, tenant_id, app_id, record_id)
    if record is None:
        raise NotFoundError("Record", record_id)
    record = _compute_formula_fields(record, model)
    populated = await _populate_relation_fields([record], model)
    return populated[0]


async def list_records(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    page: int = 1,
    page_size: int = 50,
    sort_field: str = "created_at",
    sort_dir: int = -1,
    filters: list[dict] | dict | None = None,
    search: str | None = None,
) -> PaginatedRecordsResponse:
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        raise NotFoundError("Model", model_slug)

    # Collect searchable field names for backend full-text search
    # If no fields are explicitly marked searchable, fall back to all text-like fields
    _text_types = {"text", "email", "phone", "url", "select", "rich_text"}
    search_fields = [f.name for f in model.fields if f.is_searchable and f.type not in ("boolean", "file", "json")]
    if not search_fields:
        search_fields = [f.name for f in model.fields if f.type in _text_types]

    skip = (page - 1) * page_size
    items, total = await list_dynamic_records(
        model_slug=model_slug,
        tenant_id=tenant_id,
        app_id=app_id,
        filters=filters,
        sort_field=sort_field,
        sort_dir=sort_dir,
        skip=skip,
        limit=page_size,
        search=search,
        search_fields=search_fields or None,
    )
    # Recompute formula fields on every read so values are always fresh
    items = [_compute_formula_fields(item, model) for item in items]
    # Batch-populate RELATION fields (one $in query per relation field)
    items = await _populate_relation_fields(items, model)
    return PaginatedRecordsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(skip + len(items)) < total,
    )
