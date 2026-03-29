from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, status

from apps.templates.definitions import TEMPLATES, TEMPLATE_BY_ID
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


@router.get("/templates", tags=["templates"])
async def list_templates(
    category: str | None = None,
    _=Depends(get_current_active_user),
):
    """List all available app templates."""
    templates = TEMPLATES
    if category:
        templates = [t for t in templates if t.get("category") == category]
    # Return without the full model field specs (just metadata for the gallery)
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "icon": t["icon"],
            "color": t["color"],
            "category": t["category"],
            "tags": t["tags"],
            "model_count": len(t["models"]),
            "models": [{"name": m["name"], "slug": m["slug"], "field_count": len(m["fields"])} for m in t["models"]],
        }
        for t in templates
    ]


@router.get("/templates/{template_id}", tags=["templates"])
async def get_template(
    template_id: str,
    _=Depends(get_current_active_user),
):
    """Get full template spec including all models and fields."""
    template = TEMPLATE_BY_ID.get(template_id)
    if not template:
        raise NotFoundError("Template", template_id)
    return template


@router.post("/templates/{template_id}/instantiate", status_code=status.HTTP_201_CREATED, tags=["templates"])
async def instantiate_template(
    template_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("apps", "create")),
):
    """
    Create a real app (with all models) from a template.
    Returns the created AppResponse.
    """
    template = TEMPLATE_BY_ID.get(template_id)
    if not template:
        raise NotFoundError("Template", template_id)

    from apps.schema_engine.schemas import AppCreate, ModelCreate, FieldCreate
    from apps.schema_engine.service import create_new_app, create_new_model

    app_spec = template["app"]
    # Make slug unique
    safe_slug = re.sub(r"[^a-z0-9-]", "", app_spec["slug"].lower().replace("_", "-"))
    unique_slug = f"{safe_slug[:40]}-{str(uuid.uuid4())[:8]}"

    app = await create_new_app(
        AppCreate(
            name=app_spec["name"],
            slug=unique_slug,
            description=app_spec.get("description", ""),
            icon=app_spec.get("icon"),
            color=app_spec.get("color"),
        ),
        tenant_id=tenant_id,
        created_by=str(current_user.id),
    )
    app_id = str(app.id)

    for m_spec in template["models"]:
        model_slug = re.sub(r"[^a-z0-9_]", "", m_spec["slug"].lower())
        fields = [
            FieldCreate(
                name=f["name"],
                label=f["label"],
                type=f["type"],
                config=f.get("config", {}),
                order=f.get("order", 0),
                is_required=f.get("is_required", False),
                is_searchable=f.get("is_searchable", False),
                is_filterable=f.get("is_filterable", False),
                is_sortable=f.get("is_sortable", False),
            )
            for f in m_spec["fields"]
        ]
        await create_new_model(
            app_id=app_id,
            payload=ModelCreate(
                name=m_spec["name"],
                slug=model_slug,
                plural_name=m_spec.get("plural_name", m_spec["name"]),
                icon=m_spec.get("icon"),
                fields=fields,
            ),
            tenant_id=tenant_id,
        )

    # Create default roles
    try:
        from apps.rbac.models import Permission, Role
        suffix = app_id[-6:]
        resources = ["apps", "models", "records", "workflows", "rules", "approvals"]
        admin = Role(
            name=f"App Admin [{suffix}]",
            tenant_id=tenant_id, app_id=app_id,
            description=f"Full access — auto-created from template '{template_id}'",
            permissions=[Permission(resource=r, actions=["create", "read", "update", "delete"]) for r in resources],
        )
        await admin.insert()
        member = Role(
            name=f"App Member [{suffix}]",
            tenant_id=tenant_id, app_id=app_id,
            description=f"Read/create access — auto-created from template '{template_id}'",
            permissions=[Permission(resource=r, actions=["read", "create"]) for r in resources],
        )
        await member.insert()
    except Exception:
        pass

    from apps.schema_engine.routes import _app_to_response
    return _app_to_response(app)
