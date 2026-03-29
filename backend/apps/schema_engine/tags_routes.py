from __future__ import annotations

from datetime import datetime, timezone

from beanie import Document
from fastapi import APIRouter, Body, Depends, status
from pymongo import IndexModel
from pydantic import Field

from core.dependencies import get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


class RecordTag(Document):
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    tag: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "record_tags"
        indexes = [
            IndexModel([("tenant_id", 1), ("app_id", 1), ("model_slug", 1), ("record_id", 1)]),
            IndexModel([("tenant_id", 1), ("app_id", 1), ("model_slug", 1), ("tag", 1)]),
        ]


@router.get("/schema/apps/{app_id}/{model_slug}/records/{record_id}/tags")
async def list_record_tags(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """List all tags on a record."""
    tags = await RecordTag.find(
        RecordTag.tenant_id == tenant_id,
        RecordTag.app_id == app_id,
        RecordTag.model_slug == model_slug,
        RecordTag.record_id == record_id,
    ).to_list()
    return [
        {
            "id": str(t.id),
            "tag": t.tag,
            "created_by": t.created_by,
            "created_at": t.created_at.isoformat().replace("+00:00", "Z"),
        }
        for t in tags
    ]


@router.post(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/tags",
    status_code=status.HTTP_201_CREATED,
)
async def add_record_tag(
    app_id: str,
    model_slug: str,
    record_id: str,
    body: dict = Body(...),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """Add a tag to a record. Body: {"tag": "string"}"""
    tag_value = body.get("tag", "").strip()
    if not tag_value:
        from core.exceptions import ValidationError
        raise ValidationError("'tag' is required and cannot be empty.")

    # Avoid duplicates
    existing = await RecordTag.find_one(
        RecordTag.tenant_id == tenant_id,
        RecordTag.app_id == app_id,
        RecordTag.model_slug == model_slug,
        RecordTag.record_id == record_id,
        RecordTag.tag == tag_value,
    )
    if existing:
        return {
            "id": str(existing.id),
            "tag": existing.tag,
            "created_by": existing.created_by,
            "created_at": existing.created_at.isoformat().replace("+00:00", "Z"),
        }

    record_tag = RecordTag(
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug=model_slug,
        record_id=record_id,
        tag=tag_value,
        created_by=str(current_user.id),
    )
    await record_tag.insert()
    return {
        "id": str(record_tag.id),
        "tag": record_tag.tag,
        "created_by": record_tag.created_by,
        "created_at": record_tag.created_at.isoformat().replace("+00:00", "Z"),
    }


@router.delete(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/tags/{tag}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_record_tag(
    app_id: str,
    model_slug: str,
    record_id: str,
    tag: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "delete")),
):
    """Remove a tag from a record."""
    record_tag = await RecordTag.find_one(
        RecordTag.tenant_id == tenant_id,
        RecordTag.app_id == app_id,
        RecordTag.model_slug == model_slug,
        RecordTag.record_id == record_id,
        RecordTag.tag == tag,
    )
    if not record_tag:
        raise NotFoundError("Tag", tag)
    await record_tag.delete()


@router.get("/schema/apps/{app_id}/{model_slug}/tags")
async def list_model_tags(
    app_id: str,
    model_slug: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """List all unique tags used across all records in this model."""
    tags = await RecordTag.find(
        RecordTag.tenant_id == tenant_id,
        RecordTag.app_id == app_id,
        RecordTag.model_slug == model_slug,
    ).to_list()
    unique_tags = sorted({t.tag for t in tags})
    return {"tags": unique_tags}
