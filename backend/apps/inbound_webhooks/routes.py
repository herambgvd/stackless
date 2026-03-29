from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Request, status
from pydantic import BaseModel

from apps.inbound_webhooks.models import InboundWebhook
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError, ValidationError

router = APIRouter()
public_router = APIRouter()  # no auth — token is the credential


# ── Schemas ────────────────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    app_id: str
    model_slug: str
    label: str = ""
    field_map: dict[str, str] = {}


class WebhookUpdate(BaseModel):
    label: str | None = None
    field_map: dict[str, str] | None = None


class WebhookResponse(BaseModel):
    id: str
    token: str
    app_id: str
    model_slug: str
    tenant_id: str
    is_active: bool
    label: str
    field_map: dict[str, str]
    created_by: str
    created_at: datetime
    last_triggered_at: datetime | None
    trigger_count: int


def _to_response(wh: InboundWebhook) -> WebhookResponse:
    return WebhookResponse(
        id=str(wh.id),
        token=wh.token,
        app_id=wh.app_id,
        model_slug=wh.model_slug,
        tenant_id=wh.tenant_id,
        is_active=wh.is_active,
        label=wh.label,
        field_map=wh.field_map,
        created_by=wh.created_by,
        created_at=wh.created_at,
        last_triggered_at=wh.last_triggered_at,
        trigger_count=wh.trigger_count,
    )


# ── Management endpoints (authenticated) ───────────────────────────────────────

@router.get("/webhooks/inbound", response_model=list[WebhookResponse])
async def list_webhooks(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    hooks = await InboundWebhook.find(InboundWebhook.tenant_id == tenant_id).to_list()
    return [_to_response(h) for h in hooks]


@router.post("/webhooks/inbound", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: WebhookCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("schema", "create")),
):
    hook = InboundWebhook(
        token=secrets.token_urlsafe(32),
        app_id=payload.app_id,
        model_slug=payload.model_slug,
        tenant_id=tenant_id,
        label=payload.label,
        field_map=payload.field_map,
        created_by=str(current_user.id),
    )
    await hook.insert()
    return _to_response(hook)


@router.delete("/webhooks/inbound/{hook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    hook_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "delete")),
):
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(hook_id)
    except Exception:
        raise NotFoundError("InboundWebhook", hook_id)
    hook = await InboundWebhook.get(oid)
    if hook is None or hook.tenant_id != tenant_id:
        raise NotFoundError("InboundWebhook", hook_id)
    await hook.delete()


@router.patch("/webhooks/inbound/{hook_id}", response_model=WebhookResponse)
async def update_webhook(
    hook_id: str,
    payload: WebhookUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "update")),
):
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(hook_id)
    except Exception:
        raise NotFoundError("InboundWebhook", hook_id)
    hook = await InboundWebhook.get(oid)
    if hook is None or hook.tenant_id != tenant_id:
        raise NotFoundError("InboundWebhook", hook_id)
    if payload.label is not None:
        hook.label = payload.label
    if payload.field_map is not None:
        hook.field_map = payload.field_map
    await hook.save()
    return _to_response(hook)


@router.patch("/webhooks/inbound/{hook_id}/toggle", response_model=WebhookResponse)
async def toggle_webhook(
    hook_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "update")),
):
    from beanie import PydanticObjectId
    try:
        oid = PydanticObjectId(hook_id)
    except Exception:
        raise NotFoundError("InboundWebhook", hook_id)
    hook = await InboundWebhook.get(oid)
    if hook is None or hook.tenant_id != tenant_id:
        raise NotFoundError("InboundWebhook", hook_id)
    hook.is_active = not hook.is_active
    await hook.save()
    return _to_response(hook)


# ── Public inbound endpoint (no auth — token is the credential) ────────────────

@public_router.post("/webhooks/inbound/{token}", status_code=status.HTTP_201_CREATED)
async def receive_webhook(
    token: str,
    request: Request,
):
    """Receive an inbound webhook payload and create a record."""
    hook = await InboundWebhook.find_one(InboundWebhook.token == token)
    if hook is None or not hook.is_active:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "Webhook not found or inactive"})

    try:
        raw_body = await request.json()
    except Exception:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"detail": "Request body must be valid JSON"})

    # Apply field mapping if configured
    if hook.field_map:
        data = {}
        for incoming_key, record_field in hook.field_map.items():
            if incoming_key in raw_body:
                data[record_field] = raw_body[incoming_key]
        # Also include unmapped fields that aren't in the map's keys
        # Strip internal _-prefixed keys to prevent metadata injection
        for k, v in raw_body.items():
            if k not in hook.field_map and k not in data and not str(k).startswith("_"):
                data[k] = v
    else:
        data = dict(raw_body)

    # Create the record
    from apps.schema_engine.service import create_record
    try:
        record = await create_record(
            model_slug=hook.model_slug,
            app_id=hook.app_id,
            tenant_id=hook.tenant_id,
            data=data,
            user_id=None,  # system-created
        )
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=422, content={"detail": str(e)})

    # Update hook stats
    hook.last_triggered_at = datetime.now(tz=timezone.utc)
    hook.trigger_count += 1
    await hook.save()

    return {"record_id": record.get("id"), "model_slug": hook.model_slug}
