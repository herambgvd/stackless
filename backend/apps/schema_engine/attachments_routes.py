"""Record Attachments — upload multiple files per record, independent of field type."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from fastapi import APIRouter, Depends, File, UploadFile, status
from pydantic import Field
from pymongo import IndexModel

from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


class RecordAttachment(Document):
    """A file attached to a record (not tied to any specific field)."""
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    filename: str
    content_type: str
    size: int
    key: str  # S3 object key
    uploaded_by: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "record_attachments"
        indexes = [
            IndexModel([("tenant_id", 1), ("app_id", 1), ("model_slug", 1), ("record_id", 1)]),
        ]


@router.get("/schema/apps/{app_id}/{model_slug}/records/{record_id}/attachments")
async def list_attachments(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """List all file attachments for a record."""
    attachments = await RecordAttachment.find(
        RecordAttachment.tenant_id == tenant_id,
        RecordAttachment.app_id == app_id,
        RecordAttachment.model_slug == model_slug,
        RecordAttachment.record_id == record_id,
    ).sort(-RecordAttachment.uploaded_at).to_list()

    return [
        {
            "id": str(a.id),
            "filename": a.filename,
            "content_type": a.content_type,
            "size": a.size,
            "uploaded_by": a.uploaded_by,
            "uploaded_at": a.uploaded_at.isoformat().replace("+00:00", "Z"),
        }
        for a in attachments
    ]


@router.post(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/attachments",
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    app_id: str,
    model_slug: str,
    record_id: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("records", "update")),
):
    """Upload a file attachment to a record."""
    from core.storage import upload_file as storage_upload

    content = await file.read()
    filename = file.filename or "attachment"
    content_type = file.content_type or "application/octet-stream"
    size = len(content)

    key = f"{tenant_id}/{app_id}/{model_slug}/{record_id}/attachments/{filename}"
    await storage_upload(key, content, content_type)

    attachment = RecordAttachment(
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug=model_slug,
        record_id=record_id,
        filename=filename,
        content_type=content_type,
        size=size,
        key=key,
        uploaded_by=str(current_user.id),
    )
    await attachment.insert()

    return {
        "id": str(attachment.id),
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "uploaded_by": attachment.uploaded_by,
        "uploaded_at": attachment.uploaded_at.isoformat().replace("+00:00", "Z"),
    }


@router.get("/schema/apps/{app_id}/{model_slug}/records/{record_id}/attachments/{attachment_id}/url")
async def get_attachment_url(
    app_id: str,
    model_slug: str,
    record_id: str,
    attachment_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "read")),
):
    """Get a signed download URL for an attachment."""
    from core.storage import get_presigned_url

    try:
        oid = PydanticObjectId(attachment_id)
    except Exception:
        raise NotFoundError("Attachment", attachment_id)

    attachment = await RecordAttachment.get(oid)
    if not attachment or attachment.tenant_id != tenant_id or attachment.record_id != record_id:
        raise NotFoundError("Attachment", attachment_id)

    url = await get_presigned_url(attachment.key, expires=3600)
    return {"url": url, "filename": attachment.filename}


@router.delete(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    app_id: str,
    model_slug: str,
    record_id: str,
    attachment_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "delete")),
):
    """Remove a file attachment from a record."""
    from core.storage import delete_file as storage_delete

    try:
        oid = PydanticObjectId(attachment_id)
    except Exception:
        raise NotFoundError("Attachment", attachment_id)

    attachment = await RecordAttachment.get(oid)
    if not attachment or attachment.tenant_id != tenant_id or attachment.record_id != record_id:
        raise NotFoundError("Attachment", attachment_id)

    try:
        await storage_delete(attachment.key)
    except Exception:
        pass  # don't fail if storage delete fails

    await attachment.delete()
