"""
Rollup field computation.

A ROLLUP field on a parent model aggregates values from child (related) records.

Field config shape:
{
  "source_model": "tasks",          # child model slug
  "relation_field": "project_id",   # field on child that references the parent
  "function": "count|sum|avg|min|max",
  "source_field": "story_points",   # field to aggregate (ignored for count)
  "filter": {"field": "status", "operator": "equals", "value": "done"}  # optional
}
"""
from __future__ import annotations

from typing import Any, Optional

import structlog

log = structlog.get_logger(__name__)


async def compute_rollup_for_record(
    parent_record_id: str,
    rollup_config: dict,
    tenant_id: str,
    app_id: str,
) -> Any:
    """
    Compute the rollup value for a single parent record.
    Returns the aggregate value (int, float, or None).
    """
    from core.database import get_motor_client
    from core.config import get_settings

    settings = get_settings()
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]

    source_model = rollup_config.get("source_model", "")
    relation_field = rollup_config.get("relation_field", "")
    func = rollup_config.get("function", "count").lower()
    source_field = rollup_config.get("source_field", "")
    filter_cfg = rollup_config.get("filter")

    if not source_model or not relation_field:
        return None

    collection_name = f"data__{tenant_id}__{app_id}__{source_model}"
    collection = db[collection_name]

    # Build match query
    match = {relation_field: parent_record_id}
    if filter_cfg:
        field = filter_cfg.get("field", "")
        operator = filter_cfg.get("operator", "equals")
        value = filter_cfg.get("value")
        op_map = {
            "equals": "$eq", "not_equals": "$ne",
            "greater_than": "$gt", "less_than": "$lt",
            "greater_equal": "$gte", "less_equal": "$lte",
        }
        mongo_op = op_map.get(operator, "$eq")
        match[field] = {mongo_op: value}

    try:
        if func == "count":
            return await collection.count_documents(match)

        # For sum/avg/min/max we need the field value
        if not source_field:
            return None

        agg_op_map = {"sum": "$sum", "avg": "$avg", "min": "$min", "max": "$max"}
        mongo_agg_op = agg_op_map.get(func)
        if not mongo_agg_op:
            return None

        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": None,
                "result": {mongo_agg_op: f"${source_field}"},
            }},
        ]
        cursor = collection.aggregate(pipeline)
        docs = await cursor.to_list(length=1)
        if docs:
            val = docs[0].get("result")
            if val is not None and func in ("sum", "avg"):
                return round(float(val), 4)
            return val
        return 0 if func == "sum" else None

    except Exception as exc:
        log.warning("Rollup computation failed", exc_info=exc, source_model=source_model)
        return None


async def recompute_rollups_for_parent(
    child_model_slug: str,
    child_record_data: dict,
    tenant_id: str,
    app_id: str,
) -> None:
    """
    Called when a child record is created/updated/deleted.
    Finds parent models that have ROLLUP fields pointing to `child_model_slug`
    and recomputes the rollup values for the affected parent record.
    """
    from apps.schema_engine.repository import list_models
    from core.database import get_motor_client
    from core.config import get_settings
    from apps.schema_engine.models import FieldType

    settings = get_settings()
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]

    # Get all models in the same app to find parent models with ROLLUP fields
    try:
        models = await list_models(app_id)
    except Exception:
        return

    for model in models:
        rollup_fields = [
            f for f in (model.fields or [])
            if f.type == FieldType.ROLLUP
            and f.config.get("source_model") == child_model_slug
        ]
        if not rollup_fields:
            continue

        # Get the parent record ID from the child record
        for rollup_field in rollup_fields:
            relation_field = rollup_field.config.get("relation_field", "")
            parent_id = child_record_data.get(relation_field)
            if not parent_id:
                continue

            # Compute new rollup value
            new_value = await compute_rollup_for_record(
                parent_record_id=str(parent_id),
                rollup_config=rollup_field.config,
                tenant_id=tenant_id,
                app_id=app_id,
            )

            # Update the parent record's rollup field
            parent_collection_name = f"data__{tenant_id}__{app_id}__{model.slug}"
            parent_collection = db[parent_collection_name]
            try:
                from bson import ObjectId
                await parent_collection.update_one(
                    {"_id": ObjectId(str(parent_id))},
                    {"$set": {rollup_field.name: new_value}},
                )
                log.debug(
                    "Rollup recomputed",
                    parent_model=model.slug,
                    field=rollup_field.name,
                    parent_id=str(parent_id),
                    value=new_value,
                )
            except Exception as exc:
                log.warning("Failed to update rollup field", exc_info=exc)
