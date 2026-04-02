from __future__ import annotations

import re
import secrets

import structlog

log = structlog.get_logger(__name__)

from apps.schema_engine.models import FieldDefinition, ModelDefinition
from apps.schema_engine.repository import (
    create_model,
    delete_model,
    get_app_by_id,
    get_model_by_id,
    get_model_by_slug,
)
from apps.schema_engine.schemas import ModelCreate, ModelUpdate
from core.database import get_tenant_db
from core.exceptions import NotFoundError


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
