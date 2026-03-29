from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status

from apps.email_inbox.models import InboundEmail, InboxConfig
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


# ── Inbox Config ──────────────────────────────────────────────────────────────

@router.get("/inbox/config")
async def get_inbox_config(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "read")),
):
    config = await InboxConfig.find_one(InboxConfig.tenant_id == tenant_id)
    if not config:
        return None
    return {
        "id": str(config.id),
        "imap_host": config.imap_host,
        "imap_port": config.imap_port,
        "imap_username": config.imap_username,
        "use_ssl": config.use_ssl,
        "mailbox": config.mailbox,
        "linked_app_id": config.linked_app_id,
        "linked_model_slug": config.linked_model_slug,
        "is_active": config.is_active,
        "last_polled_at": config.last_polled_at,
    }


@router.put("/inbox/config", status_code=status.HTTP_200_OK)
async def upsert_inbox_config(
    payload: dict,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "create")),
):
    config = await InboxConfig.find_one(InboxConfig.tenant_id == tenant_id)
    if config is None:
        config = InboxConfig(tenant_id=tenant_id, imap_host="", imap_username="", imap_password="")

    for field in ("imap_host", "imap_port", "imap_username", "imap_password",
                  "use_ssl", "mailbox", "linked_app_id", "linked_model_slug", "is_active"):
        if field in payload:
            setattr(config, field, payload[field])

    if config.id:
        await config.save()
    else:
        await config.insert()
    return {"ok": True}


@router.post("/inbox/poll", status_code=status.HTTP_202_ACCEPTED)
async def trigger_poll(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "create")),
):
    """Manually trigger an IMAP poll for this tenant's inbox."""
    import asyncio
    from apps.email_inbox.imap_service import poll_inbox

    config = await InboxConfig.find_one(
        InboxConfig.tenant_id == tenant_id,
        InboxConfig.is_active == True,  # noqa: E712
    )
    if not config:
        from fastapi import HTTPException
        raise HTTPException(404, "No active inbox configuration found.")

    asyncio.ensure_future(poll_inbox(config))
    return {"detail": "Poll started."}


# ── Emails list ───────────────────────────────────────────────────────────────

@router.get("/inbox/emails")
async def list_inbound_emails(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
    from_email: str = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    filters = [InboundEmail.tenant_id == tenant_id]
    if unread_only:
        filters.append(InboundEmail.is_read == False)  # noqa: E712
    if from_email:
        filters.append(InboundEmail.from_email == from_email)

    skip = (page - 1) * page_size
    total = await InboundEmail.find(*filters).count()
    items = await InboundEmail.find(*filters).sort(-InboundEmail.received_at).skip(skip).limit(page_size).to_list()

    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": str(e.id),
                "subject": e.subject,
                "from_email": e.from_email,
                "from_name": e.from_name,
                "received_at": e.received_at.isoformat(),
                "is_read": e.is_read,
                "has_attachments": len(e.attachments) > 0,
                "linked_record_id": e.linked_record_id,
            }
            for e in items
        ],
    }


@router.get("/inbox/emails/{email_id}")
async def get_inbound_email(
    email_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(email_id)
    except Exception:
        raise NotFoundError("InboundEmail", email_id)
    e = await InboundEmail.get(oid)
    if not e or e.tenant_id != tenant_id:
        raise NotFoundError("InboundEmail", email_id)

    # Mark as read
    if not e.is_read:
        e.is_read = True
        await e.save()

    return {
        "id": str(e.id),
        "subject": e.subject,
        "from_email": e.from_email,
        "from_name": e.from_name,
        "to_emails": e.to_emails,
        "cc_emails": e.cc_emails,
        "body_text": e.body_text,
        "body_html": e.body_html,
        "attachments": e.attachments,
        "received_at": e.received_at.isoformat(),
        "is_read": e.is_read,
        "linked_record_id": e.linked_record_id,
        "linked_model_slug": e.linked_model_slug,
        "linked_app_id": e.linked_app_id,
    }


@router.patch("/inbox/emails/{email_id}/link")
async def link_email_to_record(
    email_id: str,
    payload: dict,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("records", "update")),
):
    """Manually link an inbound email to an existing record."""
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(email_id)
    except Exception:
        raise NotFoundError("InboundEmail", email_id)
    e = await InboundEmail.get(oid)
    if not e or e.tenant_id != tenant_id:
        raise NotFoundError("InboundEmail", email_id)

    e.linked_record_id = payload.get("record_id")
    e.linked_model_slug = payload.get("model_slug")
    e.linked_app_id = payload.get("app_id")
    await e.save()
    return {"ok": True}
