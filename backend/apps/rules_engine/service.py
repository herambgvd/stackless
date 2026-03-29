from __future__ import annotations

from typing import Any, Optional

from apps.rules_engine.evaluator import RuleEvaluator
from apps.rules_engine.models import Rule, RuleCondition, RuleAction, RuleSet
from apps.rules_engine.repository import (
    create_ruleset,
    get_ruleset_by_id,
    update_ruleset,
)
from apps.rules_engine.schemas import (
    EvaluateRequest,
    EvaluateResponse,
    RuleEvaluationResult,
    RuleSetCreate,
    RuleSetUpdate,
)
from core.exceptions import NotFoundError


async def create_new_ruleset(payload: RuleSetCreate, tenant_id: str) -> RuleSet:
    rules = [
        Rule(
            name=r.name,
            trigger=r.trigger,
            priority=r.priority,
            condition=RuleCondition(**r.condition.model_dump()),
            action=RuleAction(**r.action.model_dump()),
            is_active=r.is_active,
        )
        for r in payload.rules
    ]
    return await create_ruleset(
        name=payload.name,
        model_id=payload.model_id,
        app_id=payload.app_id,
        tenant_id=tenant_id,
        rules=rules,
    )


async def update_existing_ruleset(
    ruleset_id: str,
    payload: RuleSetUpdate,
    tenant_id: str,
) -> RuleSet:
    rs = await get_ruleset_by_id(ruleset_id)
    if rs is None or rs.tenant_id != tenant_id:
        raise NotFoundError("RuleSet", ruleset_id)

    kwargs: dict = {}
    if payload.name is not None:
        kwargs["name"] = payload.name
    if payload.is_active is not None:
        kwargs["is_active"] = payload.is_active
    if payload.rules is not None:
        kwargs["rules"] = [
            Rule(
                name=r.name,
                trigger=r.trigger,
                priority=r.priority,
                condition=RuleCondition(**r.condition.model_dump()),
                action=RuleAction(**r.action.model_dump()),
                is_active=r.is_active,
            )
            for r in payload.rules
        ]
    return await update_ruleset(rs, **kwargs)


async def evaluate_rules_for_record(
    request: EvaluateRequest,
    tenant_id: str,
) -> EvaluateResponse:
    evaluator = RuleEvaluator()
    result = await evaluator.evaluate(
        record_data=request.record_data,
        trigger=request.trigger,
        model_id=request.model_id,
        tenant_id=tenant_id,
        previous_data=request.previous_data,
    )

    return EvaluateResponse(
        passed_rules=[
            RuleEvaluationResult(
                rule_id=r["rule_id"],
                rule_name=r["rule_name"],
                passed=True,
                computed_values=r.get("computed_values", {}),
                triggered_actions=r.get("triggered_actions", []),
            )
            for r in result.passed_rules
        ],
        failed_rules=[
            RuleEvaluationResult(
                rule_id=r["rule_id"],
                rule_name=r["rule_name"],
                passed=False,
                error=r.get("error"),
            )
            for r in result.failed_rules
        ],
        errors=result.errors,
        computed_values=result.computed_values,
        triggered_actions=result.triggered_actions,
    )
