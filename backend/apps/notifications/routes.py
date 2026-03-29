from __future__ import annotations

import asyncio

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from apps.notifications.models import NotificationLog
from apps.notifications.repository import (
    create_template,
    delete_template,
    get_template_by_id,
    list_inbox_logs,
    list_logs,
    list_templates,
    mark_log_read,
    update_template,
)
from apps.notifications.schemas import (
    InboxNotificationResponse,
    NotificationLogResponse,
    SendNotificationRequest,
    TemplateCreate,
    TemplateResponse,
    TemplateUpdate,
)
from apps.notifications.models import EmailBounceEvent
from apps.notifications.service import send_notification
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


def _tmpl_to_response(t) -> TemplateResponse:
    return TemplateResponse(
        id=str(t.id),
        name=t.name,
        tenant_id=t.tenant_id,
        channel=t.channel,
        subject_template=t.subject_template,
        body_template=t.body_template,
        variables=t.variables,
        is_active=t.is_active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates_endpoint(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    templates = await list_templates(tenant_id)
    return [_tmpl_to_response(t) for t in templates]


@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template_endpoint(
    payload: TemplateCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    t = await create_template(
        name=payload.name,
        tenant_id=tenant_id,
        channel=payload.channel,
        subject_template=payload.subject_template,
        body_template=payload.body_template,
        variables=payload.variables,
    )
    return _tmpl_to_response(t)


@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template_endpoint(
    template_id: str,
    _=Depends(get_current_active_user),
):
    t = await get_template_by_id(template_id)
    if not t:
        raise NotFoundError("NotificationTemplate", template_id)
    return _tmpl_to_response(t)


@router.put("/templates/{template_id}", response_model=TemplateResponse)
async def update_template_endpoint(
    template_id: str,
    payload: TemplateUpdate,
    _=Depends(get_current_active_user),
):
    t = await get_template_by_id(template_id)
    if not t:
        raise NotFoundError("NotificationTemplate", template_id)
    kwargs = payload.model_dump(exclude_none=True)
    updated = await update_template(t, **kwargs)
    return _tmpl_to_response(updated)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_endpoint(
    template_id: str,
    _=Depends(get_current_active_user),
):
    deleted = await delete_template(template_id)
    if not deleted:
        raise NotFoundError("NotificationTemplate", template_id)


@router.post("/send", status_code=status.HTTP_202_ACCEPTED)
async def send_notification_endpoint(
    payload: SendNotificationRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Immediately send a notification (or enqueue it)."""
    await send_notification(
        channel=payload.channel,
        recipient=payload.recipient,
        template_id=payload.template_id,
        notification_context=payload.context,
        tenant_id=tenant_id,
        subject=payload.subject,
        body=payload.body,
    )
    return {"detail": "Notification queued for delivery."}


@router.get("/inbox", response_model=list[InboxNotificationResponse])
async def get_inbox_endpoint(
    unread_only: bool = Query(False),
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Return in-app notifications for the current user."""
    recipient = str(current_user.id)
    logs = await list_inbox_logs(recipient, tenant_id, unread_only=unread_only)
    return [
        InboxNotificationResponse(
            id=str(log.id),
            subject=log.subject or log.payload.get("subject", "Notification"),
            body=log.payload.get("body", ""),
            is_read=log.is_read,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/inbox/unread-count")
async def get_unread_count(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Get count of unread in-app notifications for the current user."""
    count = await NotificationLog.find(
        NotificationLog.tenant_id == tenant_id,
        NotificationLog.recipient == str(current_user.id),
        NotificationLog.channel == "in_app",
        NotificationLog.is_read == False,
    ).count()
    return {"unread_count": count}


@router.patch("/inbox/mark-all-read", status_code=status.HTTP_200_OK)
async def mark_all_read(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Mark all in-app notifications as read for the current user."""
    await NotificationLog.find(
        NotificationLog.tenant_id == tenant_id,
        NotificationLog.recipient == str(current_user.id),
        NotificationLog.channel == "in_app",
        NotificationLog.is_read == False,
    ).update({"$set": {"is_read": True}})
    return {"message": "All notifications marked as read"}


@router.patch("/inbox/{log_id}/read", status_code=status.HTTP_200_OK)
async def mark_inbox_read_endpoint(
    log_id: str,
    _=Depends(get_current_active_user),
):
    log = await mark_log_read(log_id)
    if not log:
        raise NotFoundError("NotificationLog", log_id)
    return {"id": log_id, "is_read": True}


@router.get("/stream")
async def notification_stream(
    token: str = Query(..., description="Bearer access token (passed as query param for EventSource)"),
):
    """
    Server-Sent Events stream for real-time in-app notifications.
    The client passes the JWT as a query param because EventSource doesn't support
    custom headers. Stream emits 'notification' events and a heartbeat every 20s.
    """
    from core.security import verify_access_token
    from apps.auth.repository import get_user_by_id
    import json

    payload = verify_access_token(token)
    user_id = payload.get("sub") if payload else None
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    async def event_generator():
        import redis.asyncio as aioredis
        from core.config import get_settings
        settings = get_settings()
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"notifications:{user_id}"
        await pubsub.subscribe(channel)
        try:
            # Send an initial connected confirmation
            yield "event: connected\ndata: {}\n\n"
            while True:
                # Wait up to 20s for a message, then send a heartbeat
                try:
                    message = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=20)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                if message and message.get("type") == "message":
                    yield f"event: notification\ndata: {message['data']}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
            await redis.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Email bounce webhook (public — called by SMTP provider) ───────────────────

def _normalise_bounce(provider: str, body: dict) -> dict | None:
    """Extract a normalised event dict from provider-specific payload shapes.
    Returns None if the event should be ignored (e.g. delivery confirmation only)."""
    if provider == "sendgrid":
        events = body if isinstance(body, list) else [body]
        results = []
        for ev in events:
            event_type = ev.get("event", "")
            if event_type not in ("bounce", "spamreport", "unsubscribe", "delivered", "open", "click"):
                continue
            results.append({
                "email": ev.get("email", ""),
                "event_type": {"bounce": "bounced", "spamreport": "complained",
                               "unsubscribe": "unsubscribed", "delivered": "delivered",
                               "open": "opened", "click": "clicked"}.get(event_type, event_type),
                "bounce_type": "hard" if ev.get("type") == "bounce" else ("soft" if ev.get("type") == "blocked" else None),
                "reason": ev.get("reason"),
                "provider_message_id": ev.get("sg_message_id"),
            })
        return results  # type: ignore[return-value]

    if provider == "mailgun":
        event_data = body.get("event-data", body)
        event_type = event_data.get("event", "")
        mapping = {"failed": "bounced", "complained": "complained",
                   "unsubscribed": "unsubscribed", "delivered": "delivered",
                   "opened": "opened", "clicked": "clicked"}
        if event_type not in mapping:
            return []  # type: ignore[return-value]
        return [{  # type: ignore[return-value]
            "email": event_data.get("recipient", ""),
            "event_type": mapping[event_type],
            "bounce_type": "hard" if event_data.get("severity") == "permanent" else ("soft" if event_type == "failed" else None),
            "reason": event_data.get("delivery-status", {}).get("description"),
            "provider_message_id": event_data.get("id"),
        }]

    # Generic / unknown — accept flat payload
    email = body.get("email") or body.get("recipient") or body.get("address", "")
    event_type = body.get("event") or body.get("type", "bounced")
    if not email:
        return []  # type: ignore[return-value]
    return [{"email": email, "event_type": event_type, "bounce_type": None, "reason": body.get("reason"), "provider_message_id": None}]  # type: ignore[return-value]


@router.post("/webhooks/bounce/{provider}", status_code=status.HTTP_200_OK)
async def email_bounce_webhook(
    provider: str,
    request: Request,
    x_webhook_signature: Optional[str] = Header(None, alias="X-Bounce-Signature"),
):
    """
    Public endpoint for SMTP provider bounce/event webhooks.
    Supported providers: sendgrid, mailgun, generic.
    Configure your provider to POST to: /api/notifications/webhooks/bounce/{provider}

    If BOUNCE_WEBHOOK_SECRET is set, callers must include:
      X-Bounce-Signature: sha256=<hmac_hex>
    computed as HMAC-SHA256 of the raw request body using the secret.
    """
    import asyncio
    import hashlib
    import hmac as _hmac

    from core.config import get_settings as _get_settings
    _settings = _get_settings()

    raw_body = await request.body()

    # Validate HMAC signature if a secret is configured
    if _settings.BOUNCE_WEBHOOK_SECRET:
        if not x_webhook_signature:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Missing X-Bounce-Signature header.")
        expected = "sha256=" + _hmac.HMAC(
            _settings.BOUNCE_WEBHOOK_SECRET.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not _hmac.compare_digest(expected, x_webhook_signature):
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Invalid bounce webhook signature.")

    try:
        import json
        body = json.loads(raw_body) if raw_body else {}
    except Exception:
        body = {}

    events = _normalise_bounce(provider, body) or []
    async def _persist():
        for ev in events:
            if not ev.get("email"):
                continue
            await EmailBounceEvent(
                email=ev["email"],
                event_type=ev["event_type"],
                provider=provider,
                provider_message_id=ev.get("provider_message_id"),
                bounce_type=ev.get("bounce_type"),
                reason=ev.get("reason"),
                raw_payload=body if isinstance(body, dict) else {},
            ).insert()

    asyncio.ensure_future(_persist())
    return {"ok": True, "events_received": len(events)}


@router.get("/bounce-events")
async def list_bounce_events(
    email: str = Query(None),
    event_type: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _=Depends(require_permission("admin", "read")),
):
    """Admin: list recorded email bounce/delivery events."""
    filters = []
    if email:
        filters.append(EmailBounceEvent.email == email)
    if event_type:
        filters.append(EmailBounceEvent.event_type == event_type)

    skip = (page - 1) * page_size
    query = EmailBounceEvent.find(*filters) if filters else EmailBounceEvent.find()
    total = await query.count()
    items = await query.sort(-EmailBounceEvent.received_at).skip(skip).limit(page_size).to_list()
    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": str(ev.id),
                "email": ev.email,
                "event_type": ev.event_type,
                "provider": ev.provider,
                "bounce_type": ev.bounce_type,
                "reason": ev.reason,
                "provider_message_id": ev.provider_message_id,
                "received_at": ev.received_at.isoformat(),
            }
            for ev in items
        ],
    }


@router.get("/logs", response_model=list[NotificationLogResponse])
async def list_logs_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    skip = (page - 1) * page_size
    logs = await list_logs(tenant_id, skip=skip, limit=page_size)
    return [
        NotificationLogResponse(
            id=str(l.id),
            tenant_id=l.tenant_id,
            channel=l.channel,
            recipient=l.recipient,
            template_id=l.template_id,
            status=l.status,
            sent_at=l.sent_at,
            error=l.error,
            payload=l.payload,
            created_at=l.created_at,
        )
        for l in logs
    ]
