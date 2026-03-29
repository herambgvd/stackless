from __future__ import annotations

from typing import Any, Optional

from apps.portal.repository import create_submission
from apps.portal.schemas import (
    PortalAppSchema,
    PortalModelSchema,
    PortalSchemaField,
    PortalSchemaResponse,
    PortalSubmissionResponse,
)
from apps.schema_engine.repository import (
    get_app_by_id,
    get_model_by_slug,
    list_models,
    create_dynamic_record,
)
from core.exceptions import NotFoundError, ValidationError


def _model_to_portal_schema(model) -> PortalModelSchema:
    """Convert a ModelDefinition into a PortalModelSchema."""
    fields = [
        PortalSchemaField(
            id=f.name,
            key=f.name,
            label=f.label,
            type=f.type.value,
            required=f.is_required,
            placeholder=f.config.get("placeholder"),
            description=f.config.get("description"),
            options=f.config.get("options"),
            related_model_slug=f.config.get("related_model_slug"),
            allow_multiple=f.config.get("allow_multiple"),
        )
        for f in sorted(model.fields, key=lambda x: x.order)
    ]
    return PortalModelSchema(
        model_id=str(model.id),
        slug=model.slug,
        name=model.name,
        plural_name=model.plural_name,
        fields=fields,
    )


async def get_portal_app_schema(app_id: str, tenant_id: str) -> PortalAppSchema:
    """Return the full portal schema (all models) for an app."""
    app = await get_app_by_id(app_id)
    if not app or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)

    models = await list_models(app_id)
    return PortalAppSchema(
        app_id=app_id,
        app_name=app.name,
        description=app.description,
        models=[_model_to_portal_schema(m) for m in models],
    )


async def get_portal_schema(app_id: str, tenant_id: str) -> PortalSchemaResponse:
    """Backward-compat: return first model's schema as a flat PortalSchemaResponse."""
    app = await get_app_by_id(app_id)
    if not app or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)

    models = await list_models(app_id)
    if not models:
        return PortalSchemaResponse(app_id=app_id, name=app.name, description=app.description, fields=[])

    primary = _model_to_portal_schema(models[0])
    return PortalSchemaResponse(
        app_id=app_id,
        name=app.name,
        description=app.description,
        fields=primary.fields,
    )


async def submit_portal_form(
    app_id: str,
    tenant_id: str,
    data: dict[str, Any],
    model_slug: Optional[str] = None,
    submitted_by: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> PortalSubmissionResponse:
    """Validate, persist as a dynamic record, and log a portal submission."""
    app = await get_app_by_id(app_id)
    if not app or app.tenant_id != tenant_id:
        raise NotFoundError("App", app_id)

    # Resolve which model to submit to
    all_models = await list_models(app_id)
    if not all_models:
        raise ValidationError("This app has no models configured yet.")

    if model_slug:
        target_model = await get_model_by_slug(model_slug, app_id)
        if not target_model or target_model.tenant_id != tenant_id:
            raise NotFoundError("Model", model_slug)
    else:
        target_model = all_models[0]

    # Validate required fields
    errors = []
    for field in target_model.fields:
        if field.is_required and not data.get(field.name):
            errors.append(f"'{field.label}' is required.")
    if errors:
        raise ValidationError("; ".join(errors))

    # Create the actual dynamic record in the model's collection
    record = await create_dynamic_record(
        model_slug=target_model.slug,
        tenant_id=tenant_id,
        app_id=app_id,
        data=data,
    )
    record_id = record.get("id")

    # Also log a portal submission for audit trail
    submission = await create_submission(
        app_id=app_id,
        tenant_id=tenant_id,
        data=data,
        submitted_by=submitted_by,
        ip_address=ip_address,
        model_slug=target_model.slug,
        record_id=record_id,
    )

    return PortalSubmissionResponse(
        id=str(submission.id),
        app_id=submission.app_id,
        model_slug=target_model.slug,
        record_id=record_id,
        tenant_id=submission.tenant_id,
        data=submission.data,
        status=submission.status,
        created_at=submission.created_at,
    )
