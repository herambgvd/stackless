from __future__ import annotations

import re
import secrets
from typing import Any, Optional

import structlog

log = structlog.get_logger(__name__)

from apps.schema_engine.models import FieldDefinition, FieldType, ModelDefinition
from apps.schema_engine.repository import (
    create_app,
    create_dynamic_record,
    create_model,
    delete_app,
    delete_model,
    get_app_by_id,
    get_app_by_slug,
    get_dynamic_record,
    get_model_by_id,
    get_model_by_slug,
    list_dynamic_records,
    update_app,
    update_dynamic_record,
    delete_dynamic_record,
)
from apps.schema_engine.schemas import (
    AppCreate,
    AppUpdate,
    ModelCreate,
    ModelUpdate,
    PaginatedRecordsResponse,
)
from core.database import get_tenant_db
from core.exceptions import ConflictError, NotFoundError, ValidationError


def _slug_from_name(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug).strip("-")
    return slug[:48] or "app"


async def create_new_app(payload: AppCreate, tenant_id: str, created_by: str):
    slug = payload.slug or _slug_from_name(payload.name)
    if await get_app_by_slug(slug, tenant_id):
        slug = f"{slug[:44]}-{secrets.token_hex(2)}"
    return await create_app(
        name=payload.name,
        slug=slug,
        tenant_id=tenant_id,
        created_by=created_by,
        description=payload.description,
        icon=payload.icon,
        color=payload.color,
    )


async def update_existing_app(app_id: str, payload: AppUpdate, tenant_id: str):
    app = await get_app_by_id(app_id)
    if app is None or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)
    kwargs = payload.model_dump(exclude_none=True)
    return await update_app(app, **kwargs)


def _model_slug_from_name(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s_]", "", slug)
    slug = re.sub(r"\s+", "_", slug).strip("_")
    return slug[:48] or "model"


async def create_new_model(app_id: str, payload: ModelCreate, tenant_id: str):
    app = await get_app_by_id(app_id)
    if app is None or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)

    slug = payload.slug or _model_slug_from_name(payload.name)
    if await get_model_by_slug(slug, app_id):
        slug = f"{slug[:44]}_{secrets.token_hex(2)}"

    plural_name = payload.plural_name or f"{payload.name}s"

    fields = [
        FieldDefinition(
            name=f.name,
            label=f.label,
            type=f.type,
            config=f.config,
            order=f.order,
            is_searchable=f.is_searchable,
            is_filterable=f.is_filterable,
            is_sortable=f.is_sortable,
            is_required=f.is_required,
            default_value=f.default_value,
            perm_level=getattr(f, "perm_level", 0),
        )
        for f in (payload.fields or [])
    ]

    model = await create_model(
        app_id=app_id,
        tenant_id=tenant_id,
        name=payload.name,
        slug=slug,
        plural_name=plural_name,
        icon=payload.icon,
        order=payload.order,
        is_submittable=payload.is_submittable,
        naming_series=payload.naming_series,
        fields=fields,
    )

    await _ensure_model_indexes(model)
    return model


async def _ensure_model_indexes(model: ModelDefinition) -> None:
    from pymongo import ASCENDING, TEXT

    db = get_tenant_db(model.tenant_id)
    collection_name = f"data__{model.app_id}__{model.slug}"
    col = db[collection_name]

    await col.create_index([("_tenant_id", ASCENDING)])
    await col.create_index([("created_at", ASCENDING)])

    for idx in model.indexes:
        keys = [(f, ASCENDING) for f in idx.fields]
        await col.create_index(keys, unique=idx.unique, sparse=idx.sparse)

    # Create a MongoDB text index on all is_searchable text/textarea fields
    # so $text queries can be used for efficient full-text search.
    searchable_fields = [
        f.name for f in model.fields
        if f.is_searchable and f.type not in ("boolean", "file", "json", "number", "currency", "date", "datetime", "formula")
    ]
    if searchable_fields:
        text_index_keys = [(name, TEXT) for name in searchable_fields]
        try:
            await col.create_index(text_index_keys, name="fulltext_search_idx", default_language="english")
        except Exception:
            # Drop and recreate if field list changed
            try:
                await col.drop_index("fulltext_search_idx")
                await col.create_index(text_index_keys, name="fulltext_search_idx", default_language="english")
            except Exception:
                pass


async def update_existing_model(model_id: str, payload: ModelUpdate, tenant_id: str):
    model = await get_model_by_id(model_id)
    if model is None or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)

    kwargs: dict = {}
    if payload.name is not None:
        kwargs["name"] = payload.name
    if payload.plural_name is not None:
        kwargs["plural_name"] = payload.plural_name
    if payload.icon is not None:
        kwargs["icon"] = payload.icon
    if payload.order is not None:
        kwargs["order"] = payload.order
    if payload.is_submittable is not None:
        kwargs["is_submittable"] = payload.is_submittable
    if payload.naming_series is not None:
        kwargs["naming_series"] = payload.naming_series or None  # empty string → None
    if payload.permissions is not None:
        kwargs["permissions"] = payload.permissions
    if payload.user_permissions is not None:
        kwargs["user_permissions"] = payload.user_permissions
    if payload.workflow_states is not None:
        kwargs["workflow_states"] = [s.model_dump() for s in payload.workflow_states]
    if payload.fields is not None:
        kwargs["fields"] = [
            FieldDefinition(
                name=f.name,
                label=f.label,
                type=f.type,
                config=f.config,
                order=f.order,
                is_searchable=f.is_searchable,
                is_filterable=f.is_filterable,
                is_sortable=f.is_sortable,
                is_required=f.is_required,
                default_value=f.default_value,
                perm_level=getattr(f, "perm_level", 0),
            )
            for f in payload.fields
        ]
    from apps.schema_engine.repository import update_model
    updated = await update_model(model, **kwargs)
    await _ensure_model_indexes(updated)
    return updated


# ── Rules & Workflow hooks ─────────────────────────────────────────────────────

async def _apply_rules(
    data: dict[str, Any],
    model: ModelDefinition,
    tenant_id: str,
    trigger: str,
    record_id: str = "",
    app_id: str = "",
    previous_data: dict | None = None,
) -> dict[str, Any]:
    """Run rules engine against record data. Raises ValidationError on failures. Returns data with computed values applied."""
    from apps.rules_engine.evaluator import RuleEvaluator
    from apps.rules_engine.models import RuleTrigger

    trigger_map = {
        "on_create": RuleTrigger.ON_CREATE,
        "on_update": RuleTrigger.ON_UPDATE,
        "on_delete": RuleTrigger.ON_DELETE,
        "on_save":   RuleTrigger.ON_SAVE,
    }
    rule_trigger = trigger_map.get(trigger, RuleTrigger.ON_SAVE)

    try:
        evaluator = RuleEvaluator()
        result = await evaluator.evaluate(
            record_data=data,
            trigger=rule_trigger,
            model_id=str(model.id),
            tenant_id=tenant_id,
            previous_data=previous_data or {},
        )
    except Exception as exc:
        # Never block record save due to rules engine failure — but log it
        log.error("Rules engine failed", error=str(exc), model_slug=model_slug, exc_info=True)
        return data

    if result.errors:
        raise ValidationError("; ".join(result.errors))

    if result.computed_values:
        data = {**data, **result.computed_values}

    # Dispatch any rule-triggered workflow/approval/notification actions (non-blocking)
    if result.triggered_actions:
        await _dispatch_rule_actions(
            result.triggered_actions,
            record_id=record_id,
            model_id=str(model.id),
            app_id=app_id,
            tenant_id=tenant_id,
        )

    return data


async def _dispatch_rule_actions(
    triggered_actions: list[str],
    record_id: str,
    model_id: str,
    app_id: str,
    tenant_id: str,
) -> None:
    """Dispatch triggered actions from rules engine (trigger_workflow, trigger_approval, send_notification). Non-blocking."""
    for action_ref in triggered_actions:
        try:
            if ":" not in action_ref:
                continue
            action_type, action_id = action_ref.split(":", 1)

            if action_type == "trigger_workflow":
                from apps.workflow_engine.tasks import execute_workflow_task
                execute_workflow_task.delay(
                    workflow_id=action_id,
                    trigger_record_id=record_id,
                    trigger_event="rule_triggered",
                    context={"model_id": model_id, "app_id": app_id, "record_id": record_id},
                )

            elif action_type == "trigger_approval":
                from apps.approval_engine.service import submit_for_approval
                from apps.approval_engine.schemas import ApprovalRequestCreate
                payload = ApprovalRequestCreate(
                    flow_id=action_id,
                    model_id=model_id,
                    record_id=record_id,
                    metadata={"triggered_by": "rules_engine"},
                )
                await submit_for_approval(payload, tenant_id, "system")

            elif action_type == "send_notification":
                from apps.notifications.service import send_notification
                # action_id is encoded as "template_id:recipient"
                parts = action_id.split(":", 1)
                template_id = parts[0] or None
                recipient = parts[1] if len(parts) > 1 else ""
                if not recipient:
                    recipient = tenant_id  # fallback to tenant namespace
                await send_notification(
                    channel="in_app",
                    recipient=recipient,
                    template_id=template_id,
                    notification_context={"record_id": record_id, "model_id": model_id},
                    tenant_id=tenant_id,
                )
        except Exception as exc:
            log.error("Rule action dispatch failed", error=str(exc), exc_info=True)


async def _dispatch_record_workflows(
    model_id: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
    event: str,
) -> None:
    """Fire Celery tasks for any active workflows matching this model + event. Non-blocking."""
    from apps.workflow_engine.repository import get_active_workflows_for_model_and_event
    from apps.workflow_engine.tasks import execute_workflow_task
    from apps.workflow_engine.models import TriggerType

    try:
        workflows = await get_active_workflows_for_model_and_event(model_id, tenant_id, event)
        for wf in workflows:
            if wf.trigger.type != TriggerType.RECORD_EVENT:
                continue
            wf_event = wf.trigger.event
            # Fire if workflow listens to this specific event, or has no event filter
            if wf_event is not None and wf_event.value != event:
                continue
            execute_workflow_task.delay(
                workflow_id=str(wf.id),
                trigger_record_id=record_id,
                trigger_event=event,
                context={"model_id": model_id, "app_id": app_id, "record_id": record_id},
            )
    except Exception as exc:
        log.error("Workflow dispatch failed", error=str(exc), exc_info=True)


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


# ── Record CRUD with hooks ─────────────────────────────────────────────────────

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
                errors.append(f"Field '{label}' value {value!r} is not in allowed options: {allowed}.")

        elif field.type == FieldType.MULTISELECT:
            allowed = field.config.get("options", [])
            if allowed and isinstance(value, list):
                bad = [v for v in value if v not in allowed]
                if bad:
                    errors.append(f"Field '{label}' contains invalid options: {bad}.")

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


async def _write_audit_log(
    tenant_id: str,
    app_id: str,
    model_slug: str,
    record_id: str,
    action: str,
    user_id: Optional[str],
    changes: dict,
    snapshot: Optional[dict] = None,
) -> None:
    """Write an audit log entry. Non-blocking — never raises."""
    try:
        from apps.audit.models import AuditLog
        await AuditLog(
            tenant_id=tenant_id,
            app_id=app_id,
            model_slug=model_slug,
            record_id=record_id,
            action=action,
            user_id=user_id,
            changes=changes,
            snapshot=snapshot,
        ).insert()
    except Exception:
        pass


async def _run_server_scripts(
    hook: str,
    model_slug: str,
    app_id: str,
    tenant_id: str,
    doc: dict[str, Any],
) -> dict[str, Any]:
    """
    Execute all enabled ServerScript hooks of the given type for this model.
    The script runs in a sandboxed exec() context and may modify `doc` in-place
    by assigning to `frappe.doc` (or directly to the `doc` variable).

    Returns the (possibly modified) doc dict. Never raises — failures are logged silently.
    """
    try:
        from apps.scripts.models import ServerScript
        scripts = await ServerScript.find(
            ServerScript.tenant_id == tenant_id,
            ServerScript.app_id == app_id,
            ServerScript.model_slug == model_slug,
            ServerScript.script_type == hook,
            ServerScript.enabled == True,  # noqa: E712
        ).to_list()
    except Exception:
        return doc

    for script in scripts:
        try:
            import io as _io
            stdout_buf = _io.StringIO()

            def _print(*args, **kwargs):
                stdout_buf.write(kwargs.get("sep", " ").join(str(a) for a in args) + kwargs.get("end", "\n"))

            exec_globals: dict = {
                "__builtins__": {
                    "print": _print,
                    "len": len, "str": str, "int": int, "float": float, "bool": bool,
                    "list": list, "dict": dict, "tuple": tuple, "set": set,
                    "range": range, "enumerate": enumerate, "zip": zip,
                    "sorted": sorted, "min": min, "max": max, "sum": sum,
                    "abs": abs, "round": round, "isinstance": isinstance,
                    # Removed getattr/setattr — they enable class-hierarchy sandbox escapes
                    "True": True, "False": False, "None": None,
                    "Exception": Exception, "ValueError": ValueError,
                },
                "doc": doc,
                "model_slug": model_slug,
                "app_id": app_id,
                "tenant_id": tenant_id,
            }
            exec_locals: dict = {}
            import threading as _threading
            _result: dict = {}
            def _run_script():
                try:
                    exec(compile(script.script, f"<hook:{hook}>", "exec"), exec_globals, exec_locals)
                except Exception as _e:
                    _result["error"] = _e
            _t = _threading.Thread(target=_run_script, daemon=True)
            _t.start()
            _t.join(timeout=5.0)  # Hard 5-second cap per script
            if _t.is_alive():
                raise TimeoutError("Script execution exceeded 5-second limit")
            # Script may mutate exec_globals["doc"] or exec_locals["doc"]
            if "doc" in exec_locals:
                doc = exec_locals["doc"]
            elif "doc" in exec_globals and exec_globals["doc"] is not doc:
                doc = exec_globals["doc"]
        except Exception:
            pass

    return doc


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
    except Exception:
        pass

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
    except Exception:
        pass

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
        except Exception:
            pass


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
    from core.exceptions import ValidationError

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


async def delete_model_cascade(model_id: str, tenant_id: str) -> None:
    """Delete a model and all its records + views."""
    model = await get_model_by_id(model_id)
    if model is None or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)

    # Drop the dynamic records collection
    db = get_tenant_db(tenant_id)
    col_name = f"data__{model.app_id}__{model.slug}"
    await db.drop_collection(col_name)

    # Delete all views for this model
    from apps.schema_engine.models import View
    await View.find(
        View.app_id == model.app_id,
        View.model_slug == model.slug,
        View.tenant_id == tenant_id,
    ).delete()

    # Delete the model definition
    await model.delete()


async def delete_app_cascade(app_id: str, tenant_id: str) -> None:
    """Delete an app, all its models, all records, all views, and dashboard widgets."""
    from apps.schema_engine.repository import list_models

    app = await get_app_by_id(app_id)
    if app is None or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)

    models = await list_models(app_id)
    for model in models:
        await delete_model_cascade(str(model.id), tenant_id)

    # Delete dashboard widgets for this app
    try:
        from apps.dashboard.models import DashboardWidget
        await DashboardWidget.find(
            DashboardWidget.app_id == app_id,
            DashboardWidget.tenant_id == tenant_id,
        ).delete()
    except Exception:
        pass

    await app.delete()


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
    search_fields = [f.name for f in model.fields if f.is_searchable and f.type not in ("boolean", "file", "json")]

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
