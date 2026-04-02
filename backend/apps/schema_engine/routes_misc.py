from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from apps.schema_engine.models import ModelDefinition
from apps.schema_engine.repository import get_model_by_slug, list_models
from apps.schema_engine.service import update_record
from apps.schema_engine.doc_perm import assert_model_permission
from core.dependencies import get_tenant_id, require_permission
from core.exceptions import NotFoundError, ValidationError

router = APIRouter()


# ── Global Search ──────────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/search")
async def global_search_endpoint(
    app_id: str,
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "read")),
):
    """Search across all searchable models in the app. Returns up to `limit` results per model."""
    from apps.schema_engine.service import list_records
    models = await list_models(app_id)
    results = []
    for model in models:
        # Only search models that have at least one searchable field
        if not any(f.is_searchable for f in model.fields):
            continue
        # Respect model-level DocPerm (skip models user can't read)
        try:
            assert_model_permission(model, current_user, "read")
        except Exception:
            continue
        try:
            page = await list_records(
                model_slug=model.slug,
                app_id=app_id,
                tenant_id=tenant_id,
                page=1,
                page_size=limit,
                search=q,
            )
            for rec in page.items:
                # Determine display label from common fields
                label = (
                    rec.get("_name") or rec.get("name") or rec.get("title") or
                    rec.get("label") or rec.get("id", "")
                )
                results.append({
                    "model_slug": model.slug,
                    "model_name": model.name,
                    "record_id": rec.get("id"),
                    "label": str(label),
                })
        except Exception:
            continue
    return {"query": q, "results": results[:limit * len(models)]}


# ── Workflow State Transition ──────────────────────────────────────────────────

@router.post("/apps/{app_id}/{model_slug}/records/{record_id}/workflow-transition")
async def workflow_state_transition(
    app_id: str,
    model_slug: str,
    record_id: str,
    body: dict,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Transition a record to a new workflow state."""
    to_state: str = body.get("to_state", "")
    if not to_state:
        raise ValidationError("to_state is required")

    # Load model definition to get workflow states
    model_def = await ModelDefinition.find_one(
        ModelDefinition.tenant_id == tenant_id,
        ModelDefinition.app_id == app_id,
        ModelDefinition.slug == model_slug,
    )
    if not model_def:
        raise NotFoundError("Model", model_slug)

    states = model_def.workflow_states or []
    state_map = {s["name"]: s for s in (s if isinstance(s, dict) else s.model_dump() for s in states)}

    if to_state not in state_map:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"State '{to_state}' is not defined for this model")

    # Load the record and check current state
    from core.database import get_tenant_db
    db = get_tenant_db(tenant_id)
    collection = db[f"{tenant_id}__{app_id}__{model_slug}"]

    from bson import ObjectId
    try:
        oid = ObjectId(record_id)
    except Exception:
        raise NotFoundError("Record", record_id)

    record = await collection.find_one({"_id": oid, "tenant_id": tenant_id})
    if not record:
        raise NotFoundError("Record", record_id)

    current_state = record.get("_workflow_state")

    # Validate transition is allowed from current state
    if current_state and current_state in state_map:
        transitions = state_map[current_state].get("transitions", [])
        allowed_targets = [t["to"] if isinstance(t, dict) else t.to for t in transitions]
        if allowed_targets and to_state not in allowed_targets:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=422,
                detail=f"Transition from '{current_state}' to '{to_state}' is not allowed"
            )

    # Apply the transition
    updated = await update_record(
        model_slug=model_slug,
        app_id=app_id,
        tenant_id=tenant_id,
        record_id=record_id,
        data={"_workflow_state": to_state},
        user_id=str(current_user.id),
    )
    return {"message": f"Workflow state changed to '{to_state}'", "record": updated}
