from __future__ import annotations

from fastapi import APIRouter, Body, Depends, status

from apps.schema_engine.repository import get_app_by_id, get_model_by_id, list_models
from apps.schema_engine.schemas import (
    FieldCreate,
    FieldResponse,
    FieldUpdate,
    ModelCreate,
    ModelResponse,
    ModelUpdate,
)
from apps.schema_engine.service import (
    create_new_model,
    update_existing_model,
    delete_model_cascade,
)
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import ConflictError, NotFoundError

router = APIRouter()


def _model_to_response(model) -> ModelResponse:
    from apps.schema_engine.schemas import WorkflowState, WorkflowTransition
    raw_states = getattr(model, "workflow_states", None) or []
    parsed_states = []
    for s in raw_states:
        if isinstance(s, dict):
            transitions = [
                WorkflowTransition(**t) if isinstance(t, dict) else t
                for t in s.get("transitions", [])
            ]
            parsed_states.append(WorkflowState(
                name=s.get("name", ""),
                label=s.get("label", ""),
                color=s.get("color", "#64748b"),
                is_initial=s.get("is_initial", False),
                transitions=transitions,
            ))
        else:
            parsed_states.append(s)

    return ModelResponse(
        id=str(model.id),
        app_id=model.app_id,
        tenant_id=model.tenant_id,
        name=model.name,
        slug=model.slug,
        plural_name=model.plural_name,
        icon=model.icon,
        order=getattr(model, "order", 0),
        is_submittable=getattr(model, "is_submittable", False),
        naming_series=getattr(model, "naming_series", None),
        permissions=getattr(model, "permissions", []),
        user_permissions=getattr(model, "user_permissions", []),
        workflow_states=parsed_states,
        fields=[
            FieldResponse(
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
            for f in model.fields
        ],
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


# ── Models ─────────────────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/models", response_model=list[ModelResponse])
async def list_models_endpoint(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    # Verify the app belongs to the requesting tenant before exposing its models
    app = await get_app_by_id(app_id)
    if not app or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)
    models = await list_models(app_id)
    return [_model_to_response(m) for m in models]


@router.post("/apps/{app_id}/models", response_model=ModelResponse, status_code=status.HTTP_201_CREATED)
async def create_model_endpoint(
    app_id: str,
    payload: ModelCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "create")),
):
    model = await create_new_model(app_id, payload, tenant_id)
    return _model_to_response(model)


@router.get("/apps/{app_id}/models/{model_id}", response_model=ModelResponse)
async def get_model_endpoint(
    app_id: str,
    model_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    model = await get_model_by_id(model_id)
    if not model or model.app_id != app_id or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)
    return _model_to_response(model)


@router.put("/apps/{app_id}/models/{model_id}", response_model=ModelResponse)
async def update_model_endpoint(
    app_id: str,
    model_id: str,
    payload: ModelUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "update")),
):
    model = await update_existing_model(model_id, payload, tenant_id)
    return _model_to_response(model)


@router.delete("/apps/{app_id}/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_endpoint(
    app_id: str,
    model_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "delete")),
):
    await delete_model_cascade(model_id, tenant_id)


# ── Custom Fields (field-level CRUD) ───────────────────────────────────────────

@router.post("/apps/{app_id}/models/{model_id}/fields", response_model=FieldResponse, status_code=status.HTTP_201_CREATED)
async def add_field_endpoint(
    app_id: str,
    model_id: str,
    payload: FieldCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "update")),
):
    """Append a new field to an existing model."""
    from apps.schema_engine.models import FieldDefinition
    from apps.schema_engine.repository import update_model
    from apps.schema_engine.service import _ensure_model_indexes

    model = await get_model_by_id(model_id)
    if not model or model.app_id != app_id or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)
    if any(f.name == payload.name for f in model.fields):
        raise ConflictError(f"Field '{payload.name}' already exists")

    new_field = FieldDefinition(
        name=payload.name,
        label=payload.label,
        type=payload.type,
        config=payload.config,
        order=payload.order if payload.order else len(model.fields),
        is_searchable=payload.is_searchable,
        is_filterable=payload.is_filterable,
        is_sortable=payload.is_sortable,
        is_required=payload.is_required,
        default_value=payload.default_value,
        perm_level=payload.perm_level,
    )
    model.fields.append(new_field)
    updated = await update_model(model, fields=model.fields)
    await _ensure_model_indexes(updated)
    f = new_field
    return FieldResponse(
        name=f.name, label=f.label, type=f.type, config=f.config,
        order=f.order, is_searchable=f.is_searchable, is_filterable=f.is_filterable,
        is_sortable=f.is_sortable, is_required=f.is_required,
        default_value=f.default_value, perm_level=f.perm_level,
    )


@router.put("/apps/{app_id}/models/{model_id}/fields/{field_name}", response_model=FieldResponse)
async def update_field_endpoint(
    app_id: str,
    model_id: str,
    field_name: str,
    payload: FieldUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "update")),
):
    """Update an existing field's metadata (label, config, flags)."""
    from apps.schema_engine.repository import update_model
    from apps.schema_engine.service import _ensure_model_indexes

    model = await get_model_by_id(model_id)
    if not model or model.app_id != app_id or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)
    field = next((f for f in model.fields if f.name == field_name), None)
    if not field:
        raise NotFoundError("Field", field_name)

    updates = payload.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(field, k, v)
    updated = await update_model(model, fields=model.fields)
    await _ensure_model_indexes(updated)
    return FieldResponse(
        name=field.name, label=field.label, type=field.type, config=field.config,
        order=field.order, is_searchable=field.is_searchable, is_filterable=field.is_filterable,
        is_sortable=field.is_sortable, is_required=field.is_required,
        default_value=field.default_value, perm_level=getattr(field, "perm_level", 0),
    )


@router.delete("/apps/{app_id}/models/{model_id}/fields/{field_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_field_endpoint(
    app_id: str,
    model_id: str,
    field_name: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "update")),
):
    """Remove a field from a model definition."""
    from apps.schema_engine.repository import update_model
    from apps.schema_engine.service import _ensure_model_indexes

    model = await get_model_by_id(model_id)
    if not model or model.app_id != app_id or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)
    before = len(model.fields)
    model.fields = [f for f in model.fields if f.name != field_name]
    if len(model.fields) == before:
        raise NotFoundError("Field", field_name)
    updated = await update_model(model, fields=model.fields)
    await _ensure_model_indexes(updated)


@router.put("/apps/{app_id}/models/{model_id}/fields-order")
async def reorder_fields_endpoint(
    app_id: str,
    model_id: str,
    payload: list[str] = Body(...),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("models", "update")),
):
    """Reorder model fields. `payload` is a list of field names in the desired order."""
    from apps.schema_engine.repository import update_model

    model = await get_model_by_id(model_id)
    if model is None or model.app_id != app_id or model.tenant_id != tenant_id:
        raise NotFoundError("Model", model_id)

    name_to_field = {f.name: f for f in model.fields}
    # Build reordered list; any fields not in payload go to the end
    ordered = [name_to_field[n] for n in payload if n in name_to_field]
    remaining = [f for f in model.fields if f.name not in set(payload)]
    for i, f in enumerate(ordered + remaining):
        f.order = i
    await update_model(model, fields=ordered + remaining)
    return {"reordered": len(ordered)}
