from __future__ import annotations

from fastapi import APIRouter, Depends, status

from apps.rules_engine.repository import (
    delete_ruleset,
    get_ruleset_by_id,
    get_rulesets_for_model,
)
from apps.rules_engine.schemas import (
    EvaluateRequest,
    EvaluateResponse,
    RuleSetCreate,
    RuleSetResponse,
    RuleSetUpdate,
)
from apps.rules_engine.service import (
    create_new_ruleset,
    evaluate_rules_for_record,
    update_existing_ruleset,
)
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


def _rs_to_response(rs) -> RuleSetResponse:
    return RuleSetResponse(
        id=str(rs.id),
        name=rs.name,
        model_id=rs.model_id,
        app_id=rs.app_id,
        tenant_id=rs.tenant_id,
        rules=[r.model_dump() for r in rs.rules],
        is_active=rs.is_active,
        created_at=rs.created_at,
        updated_at=rs.updated_at,
    )


@router.get("/models/{model_id}/rulesets", response_model=list[RuleSetResponse])
async def list_rulesets(
    model_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    rulesets = await get_rulesets_for_model(model_id, tenant_id)
    return [_rs_to_response(rs) for rs in rulesets]


@router.post(
    "/models/{model_id}/rulesets",
    response_model=RuleSetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ruleset_endpoint(
    model_id: str,
    payload: RuleSetCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("rules", "create")),
):
    payload.model_id = model_id
    rs = await create_new_ruleset(payload, tenant_id)
    return _rs_to_response(rs)


@router.get("/rulesets/{ruleset_id}", response_model=RuleSetResponse)
async def get_ruleset(
    ruleset_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    rs = await get_ruleset_by_id(ruleset_id)
    if not rs or rs.tenant_id != tenant_id:
        raise NotFoundError("RuleSet", ruleset_id)
    return _rs_to_response(rs)


@router.put("/rulesets/{ruleset_id}", response_model=RuleSetResponse)
async def update_ruleset_endpoint(
    ruleset_id: str,
    payload: RuleSetUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("rules", "update")),
):
    rs = await update_existing_ruleset(ruleset_id, payload, tenant_id)
    return _rs_to_response(rs)


@router.delete("/rulesets/{ruleset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ruleset_endpoint(
    ruleset_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("rules", "delete")),
):
    rs = await get_ruleset_by_id(ruleset_id)
    if not rs or rs.tenant_id != tenant_id:
        raise NotFoundError("RuleSet", ruleset_id)
    deleted = await delete_ruleset(ruleset_id)
    if not deleted:
        raise NotFoundError("RuleSet", ruleset_id)


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_rules(
    payload: EvaluateRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Evaluate all applicable rules against a record payload."""
    return await evaluate_rules_for_record(payload, tenant_id)
