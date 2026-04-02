from __future__ import annotations

import re as _re
from datetime import datetime, timezone
from typing import Any, Optional

from beanie import PydanticObjectId

from apps.schema_engine.models import AppDefinition, ModelDefinition


# ── App CRUD ──────────────────────────────────────────────────────────────────

async def get_app_by_id(app_id: str) -> Optional[AppDefinition]:
    try:
        oid = PydanticObjectId(app_id)
    except Exception:
        return None
    return await AppDefinition.get(oid)


async def get_app_by_slug(slug: str, tenant_id: str) -> Optional[AppDefinition]:
    return await AppDefinition.find_one(
        AppDefinition.slug == slug,
        AppDefinition.tenant_id == tenant_id,
    )


async def list_apps(tenant_id: str) -> list[AppDefinition]:
    return await AppDefinition.find(AppDefinition.tenant_id == tenant_id).to_list()


async def create_app(
    *,
    name: str,
    slug: str,
    tenant_id: str,
    created_by: str,
    description: str = "",
    icon: str = "box",
    color: str = "#6366f1",
) -> AppDefinition:
    app = AppDefinition(
        name=name,
        slug=slug,
        tenant_id=tenant_id,
        created_by=created_by,
        description=description,
        icon=icon,
        color=color,
    )
    await app.insert()
    return app


async def update_app(app: AppDefinition, **kwargs) -> AppDefinition:
    for key, value in kwargs.items():
        if hasattr(app, key):
            setattr(app, key, value)
    app.updated_at = datetime.now(tz=timezone.utc)
    await app.save()
    return app


async def delete_app(app_id: str) -> bool:
    app = await get_app_by_id(app_id)
    if app is None:
        return False
    await app.delete()
    return True


# ── Model CRUD ─────────────────────────────────────────────────────────────────

async def get_model_by_id(model_id: str) -> Optional[ModelDefinition]:
    try:
        oid = PydanticObjectId(model_id)
    except Exception:
        return None
    return await ModelDefinition.get(oid)


async def get_model_by_slug(slug: str, app_id: str) -> Optional[ModelDefinition]:
    return await ModelDefinition.find_one(
        ModelDefinition.slug == slug,
        ModelDefinition.app_id == app_id,
    )


async def list_models(app_id: str) -> list[ModelDefinition]:
    return (
        await ModelDefinition.find(ModelDefinition.app_id == app_id)
        .sort(+ModelDefinition.order)
        .to_list()
    )


async def create_model(
    *,
    app_id: str,
    tenant_id: str,
    name: str,
    slug: str,
    plural_name: str,
    icon: str = "table",
    order: int = 0,
    is_submittable: bool = False,
    naming_series: str | None = None,
    fields: list | None = None,
) -> ModelDefinition:
    model = ModelDefinition(
        app_id=app_id,
        tenant_id=tenant_id,
        name=name,
        slug=slug,
        plural_name=plural_name,
        icon=icon,
        order=order,
        is_submittable=is_submittable,
        naming_series=naming_series,
        fields=fields or [],
    )
    await model.insert()
    return model


async def update_model(model: ModelDefinition, **kwargs) -> ModelDefinition:
    for key, value in kwargs.items():
        if hasattr(model, key):
            setattr(model, key, value)
    model.updated_at = datetime.now(tz=timezone.utc)
    await model.save()
    return model


async def delete_model(model_id: str) -> bool:
    model = await get_model_by_id(model_id)
    if model is None:
        return False
    await model.delete()
    return True


# ── Dynamic Record CRUD ────────────────────────────────────────────────────────

def _get_collection(model_slug: str, tenant_id: str, app_id: str):
    """Each app's dynamic collections are isolated in the tenant's database."""
    from core.database import get_tenant_db
    db = get_tenant_db(tenant_id)
    collection_name = f"data__{app_id}__{model_slug}"
    return db[collection_name]


async def create_dynamic_record(
    model_slug: str,
    tenant_id: str,
    app_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    col = _get_collection(model_slug, tenant_id, app_id)
    now = datetime.now(tz=timezone.utc)
    doc = {**data, "_tenant_id": tenant_id, "_app_id": app_id, "created_at": now, "updated_at": now}
    result = await col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return _serialize_record(doc)


async def get_dynamic_record(
    model_slug: str,
    tenant_id: str,
    app_id: str,
    record_id: str,
) -> Optional[dict[str, Any]]:
    from bson import ObjectId

    col = _get_collection(model_slug, tenant_id, app_id)
    try:
        oid = ObjectId(record_id)
    except Exception:
        return None
    doc = await col.find_one({"_id": oid, "_tenant_id": tenant_id, "_app_id": app_id})
    return _serialize_record(doc) if doc else None


def _build_mongo_filter(field: str, operator: str, value: Any) -> dict:
    """Convert a single filter condition into a MongoDB query clause."""
    # Guard against NoSQL injection: field names must not start with '$'
    if not field or field.startswith("$"):
        return {}

    # Attempt numeric coercion for comparison operators
    coerced: Any = value
    try:
        coerced = float(value) if "." in str(value) else int(value)
    except (TypeError, ValueError):
        coerced = value

    # Escape user input before embedding in regex to prevent ReDoS
    escaped = _re.escape(str(value))

    op_map = {
        "equals":        lambda v: {field: v},
        "not_equals":    lambda v: {field: {"$ne": v}},
        "contains":      lambda v: {field: {"$regex": escaped, "$options": "i"}},
        "not_contains":  lambda v: {field: {"$not": {"$regex": escaped, "$options": "i"}}},
        "starts_with":   lambda v: {field: {"$regex": f"^{escaped}", "$options": "i"}},
        "ends_with":     lambda v: {field: {"$regex": f"{escaped}$", "$options": "i"}},
        "gt":            lambda v: {field: {"$gt": coerced}},
        "gte":           lambda v: {field: {"$gte": coerced}},
        "lt":            lambda v: {field: {"$lt": coerced}},
        "lte":           lambda v: {field: {"$lte": coerced}},
        "is_empty":      lambda v: {"$or": [{field: {"$exists": False}}, {field: None}, {field: ""}]},
        # Fix: was {"$exists": True, "$ne": None, "$ne": ""} — duplicate "$ne" key silently dropped None check
        "is_not_empty":  lambda v: {"$and": [{field: {"$exists": True}}, {field: {"$ne": None}}, {field: {"$ne": ""}}]},
        "in":            lambda v: {field: {"$in": [x.strip() for x in str(v).split(",")]}},
        "not_in":        lambda v: {field: {"$nin": [x.strip() for x in str(v).split(",")]}},
    }
    fn = op_map.get(operator, op_map["equals"])
    return fn(value)


async def list_dynamic_records(
    model_slug: str,
    tenant_id: str,
    app_id: str,
    filters: list[dict] | dict | None = None,
    sort_field: str = "created_at",
    sort_dir: int = -1,
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    search_fields: list[str] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    MAX_RECORDS_PER_PAGE = 1000
    if limit is None or limit <= 0:
        limit = 50
    elif limit > MAX_RECORDS_PER_PAGE:
        limit = MAX_RECORDS_PER_PAGE

    col = _get_collection(model_slug, tenant_id, app_id)

    # Build query from filter conditions list
    query: dict[str, Any] = {"_tenant_id": tenant_id}

    if isinstance(filters, list) and filters:
        clauses = []
        for f in filters:
            field = f.get("field", "")
            operator = f.get("operator", "equals")
            value = f.get("value", "")
            if field:
                clauses.append(_build_mongo_filter(field, operator, value))
        if clauses:
            query["$and"] = clauses
    elif isinstance(filters, dict) and filters:
        # Legacy single-field equality dict (system-generated only — sanitize keys)
        query.update({k: v for k, v in filters.items() if not str(k).startswith("$")})

    # Full-text search across searchable fields
    # Prefer MongoDB $text index if a text index exists on this collection; fall back to $regex.
    if search and search.strip() and search_fields:
        search_term = search.strip()
        try:
            index_info = await col.index_information()
            has_text_index = any(
                any(spec[1] == "text" for spec in idx.get("key", []))
                for idx in index_info.values()
            )
        except Exception:
            has_text_index = False

        if has_text_index:
            query["$text"] = {"$search": search_term}
        else:
            escaped_search = _re.escape(search_term)
            query["$or"] = [
                {f: {"$regex": escaped_search, "$options": "i"}}
                for f in search_fields
            ]

    # Sanitize sort_field: must not start with '$' and only contain safe characters
    if not sort_field or sort_field.startswith("$") or not _re.match(r"^[a-zA-Z_][a-zA-Z0-9_.]{0,63}$", sort_field):
        sort_field = "created_at"

    total = await col.count_documents(query)
    cursor = col.find(query).sort(sort_field, sort_dir).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_serialize_record(d) for d in docs], total


async def update_dynamic_record(
    model_slug: str,
    tenant_id: str,
    app_id: str,
    record_id: str,
    data: dict[str, Any],
) -> Optional[dict[str, Any]]:
    from bson import ObjectId

    col = _get_collection(model_slug, tenant_id, app_id)
    try:
        oid = ObjectId(record_id)
    except Exception:
        return None
    data["updated_at"] = datetime.now(tz=timezone.utc)
    await col.update_one({"_id": oid, "_tenant_id": tenant_id, "_app_id": app_id}, {"$set": data})
    return await get_dynamic_record(model_slug, tenant_id, app_id, record_id)


async def delete_dynamic_record(model_slug: str, tenant_id: str, app_id: str, record_id: str) -> bool:
    from bson import ObjectId

    col = _get_collection(model_slug, tenant_id, app_id)
    try:
        oid = ObjectId(record_id)
    except Exception:
        return False
    result = await col.delete_one({"_id": oid, "_tenant_id": tenant_id, "_app_id": app_id})
    return result.deleted_count > 0


async def list_views(app_id: str, model_slug: str, tenant_id: str, user_id: Optional[str] = None) -> list:
    from apps.schema_engine.models import View
    # Return shared views (user_id=None) + user's own views
    conditions = [
        View.app_id == app_id,
        View.model_slug == model_slug,
        View.tenant_id == tenant_id,
    ]
    all_views = await View.find(*conditions).to_list()
    # Filter: shared ones + this user's private ones
    if user_id:
        return [v for v in all_views if v.user_id is None or v.user_id == user_id]
    return [v for v in all_views if v.user_id is None]


async def get_view_by_id(view_id: str):
    from beanie import PydanticObjectId
    from apps.schema_engine.models import View
    try:
        oid = PydanticObjectId(view_id)
    except Exception:
        return None
    return await View.get(oid)


async def create_view(*, name: str, app_id: str, model_slug: str, tenant_id: str, user_id: Optional[str], type: str, filter_conditions: list, sort_field: str, sort_dir: int, visible_columns: list, group_by_field: Optional[str], column_widths: dict, is_default: bool):
    from apps.schema_engine.models import View, ViewFilter
    v = View(
        name=name, app_id=app_id, model_slug=model_slug, tenant_id=tenant_id,
        user_id=user_id, type=type,
        filter_conditions=[ViewFilter(**f) if isinstance(f, dict) else f for f in filter_conditions],
        sort_field=sort_field, sort_dir=sort_dir,
        visible_columns=visible_columns, group_by_field=group_by_field,
        column_widths=column_widths, is_default=is_default,
    )
    await v.insert()
    return v


async def update_view(view, **kwargs):
    from datetime import datetime, timezone
    for k, val in kwargs.items():
        if hasattr(view, k):
            setattr(view, k, val)
    view.updated_at = datetime.now(tz=timezone.utc)
    await view.save()
    return view


async def delete_view(view_id: str) -> bool:
    v = await get_view_by_id(view_id)
    if v is None:
        return False
    await v.delete()
    return True


def _serialize_record(doc: dict) -> dict:
    """Convert MongoDB doc to JSON-serializable dict with UTC ISO-8601 timestamps."""
    from bson import ObjectId
    result = {}
    for key, value in doc.items():
        if key == "_id":
            result["id"] = str(value)
        elif key in ("_tenant_id", "_app_id"):
            continue
        elif isinstance(value, datetime):
            # Ensure timezone-aware, then output as UTC with Z suffix
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            result[key] = value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        elif isinstance(value, ObjectId):
            result[key] = str(value)
        else:
            result[key] = value
    return result
