from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.rules_engine.models import RuleSet


async def get_rulesets_for_model(model_id: str, tenant_id: str) -> list[RuleSet]:
    return await RuleSet.find(
        RuleSet.model_id == model_id,
        RuleSet.tenant_id == tenant_id,
        RuleSet.is_active == True,
    ).to_list()


async def get_ruleset_by_id(ruleset_id: str) -> Optional[RuleSet]:
    try:
        oid = PydanticObjectId(ruleset_id)
    except Exception:
        return None
    return await RuleSet.get(oid)


async def create_ruleset(
    *,
    name: str,
    model_id: str,
    app_id: str,
    tenant_id: str,
    rules: list,
) -> RuleSet:
    rs = RuleSet(
        name=name,
        model_id=model_id,
        app_id=app_id,
        tenant_id=tenant_id,
        rules=rules,
    )
    await rs.insert()
    return rs


async def update_ruleset(ruleset: RuleSet, **kwargs) -> RuleSet:
    for key, value in kwargs.items():
        if hasattr(ruleset, key):
            setattr(ruleset, key, value)
    ruleset.updated_at = datetime.now(tz=timezone.utc)
    await ruleset.save()
    return ruleset


async def delete_ruleset(ruleset_id: str) -> bool:
    rs = await get_ruleset_by_id(ruleset_id)
    if rs is None:
        return False
    await rs.delete()
    return True
