from __future__ import annotations

from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from fastapi import APIRouter, Body, Depends, status
from pydantic import Field

from core.dependencies import get_tenant_id, require_permission
from core.exceptions import NotFoundError, ValidationError

router = APIRouter()


class RecordShare(Document):
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    shared_with_user_id: str
    permission: str = "read"  # "read" or "write"
    shared_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "record_shares"


@router.get("/schema/apps/{app_id}/{model_slug}/records/{record_id}/shares")
async def list_record_shares(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """List all shares for a record."""
    shares = await RecordShare.find(
        RecordShare.tenant_id == tenant_id,
        RecordShare.app_id == app_id,
        RecordShare.model_slug == model_slug,
        RecordShare.record_id == record_id,
    ).to_list()
    return [
        {
            "id": str(s.id),
            "shared_with_user_id": s.shared_with_user_id,
            "permission": s.permission,
            "shared_by": s.shared_by,
            "created_at": s.created_at.isoformat().replace("+00:00", "Z"),
        }
        for s in shares
    ]


@router.post(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/shares",
    status_code=status.HTTP_201_CREATED,
)
async def share_record(
    app_id: str,
    model_slug: str,
    record_id: str,
    body: dict = Body(...),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "create")),
):
    """Share a record with a specific user. Body: {"user_id": "...", "permission": "read"|"write"}"""
    user_id = body.get("user_id", "").strip()
    permission = body.get("permission", "read")

    if not user_id:
        raise ValidationError("'user_id' is required.")
    if permission not in ("read", "write"):
        raise ValidationError("'permission' must be 'read' or 'write'.")

    share = RecordShare(
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug=model_slug,
        record_id=record_id,
        shared_with_user_id=user_id,
        permission=permission,
        shared_by=str(current_user.id),
    )
    await share.insert()
    return {
        "id": str(share.id),
        "shared_with_user_id": share.shared_with_user_id,
        "permission": share.permission,
        "shared_by": share.shared_by,
        "created_at": share.created_at.isoformat().replace("+00:00", "Z"),
    }


@router.delete(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/shares/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_record_share(
    app_id: str,
    model_slug: str,
    record_id: str,
    share_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "delete")),
):
    """Remove a share from a record."""
    try:
        oid = PydanticObjectId(share_id)
    except Exception:
        raise NotFoundError("Share", share_id)

    share = await RecordShare.get(oid)
    if not share or share.tenant_id != tenant_id or share.record_id != record_id:
        raise NotFoundError("Share", share_id)
    await share.delete()
