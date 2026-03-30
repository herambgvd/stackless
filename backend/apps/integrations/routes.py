from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status
from apps.integrations.models import Integration
from apps.integrations.schemas import IntegrationCreate, IntegrationUpdate, IntegrationResponse
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


def _to_response(i: Integration) -> IntegrationResponse:
    return IntegrationResponse(
        id=str(i.id),
        tenant_id=i.tenant_id,
        name=i.name,
        provider=i.provider,
        credential_type=i.credential_type,
        is_active=i.is_active,
        last_used_at=i.last_used_at,
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


@router.get("/integrations", response_model=list[IntegrationResponse])
async def list_integrations(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    items = await Integration.find(Integration.tenant_id == tenant_id).to_list()
    return [_to_response(i) for i in items]


@router.post("/integrations", response_model=IntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_integration(
    payload: IntegrationCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    integration = Integration(
        tenant_id=tenant_id,
        **payload.model_dump(),
    )
    await integration.insert()
    return _to_response(integration)


@router.put("/integrations/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: str,
    payload: IntegrationUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(integration_id)
    except Exception:
        raise NotFoundError("Integration", integration_id)
    item = await Integration.get(oid)
    if not item or item.tenant_id != tenant_id:
        raise NotFoundError("Integration", integration_id)
    for key, val in payload.model_dump(exclude_none=True).items():
        setattr(item, key, val)
    item.updated_at = datetime.now(tz=timezone.utc)
    await item.save()
    return _to_response(item)


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(integration_id)
    except Exception:
        raise NotFoundError("Integration", integration_id)
    item = await Integration.get(oid)
    if not item or item.tenant_id != tenant_id:
        raise NotFoundError("Integration", integration_id)
    await item.delete()


@router.post("/integrations/{integration_id}/test")
async def test_integration(
    integration_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    """Send a test message/request to verify credentials are working."""
    try:
        oid = PydanticObjectId(integration_id)
    except Exception:
        raise NotFoundError("Integration", integration_id)
    item = await Integration.get(oid)
    if not item or item.tenant_id != tenant_id:
        raise NotFoundError("Integration", integration_id)

    try:
        if item.provider == "slack":
            from apps.integrations.connectors import send_slack_message
            result = await send_slack_message(
                item.credentials,
                {"message": "Stackless integration test — this is a test message."},
                {},
            )
        elif item.provider == "smtp":
            from apps.integrations.connectors import send_email_smtp
            to = item.credentials.get("from_email") or item.credentials.get("username", "")
            result = await send_email_smtp(
                item.credentials,
                {"to": to, "subject": "Stackless Integration Test", "body": "This is a test email from Stackless."},
                {},
            )
        elif item.provider == "generic_webhook":
            from apps.integrations.connectors import send_generic_webhook
            result = await send_generic_webhook(item.credentials, {}, {"test": True, "source": "stackless"})
        else:
            return {"status": "skipped", "message": f"Test not supported for provider '{item.provider}'."}
        return {"status": "ok", "result": result}
    except Exception as exc:
        from core.exceptions import ValidationError as StacklessValidationError
        raise StacklessValidationError(f"Integration test failed: {str(exc)}")


@router.get("/integrations/providers", response_model=list[dict])
async def list_providers(
    _=Depends(get_current_active_user),
):
    """Return metadata for all supported integration providers."""
    return [
        {"provider": "slack", "name": "Slack", "credential_type": "api_key",
         "credential_fields": [
             {"key": "webhook_url", "label": "Incoming Webhook URL", "required": False},
             {"key": "bot_token", "label": "Bot OAuth Token", "required": False},
         ]},
        {"provider": "whatsapp", "name": "WhatsApp (Twilio)", "credential_type": "api_key",
         "credential_fields": [
             {"key": "account_sid", "label": "Twilio Account SID", "required": True},
             {"key": "auth_token", "label": "Twilio Auth Token", "required": True},
             {"key": "from_number", "label": "WhatsApp From Number", "required": True},
         ]},
        {"provider": "stripe", "name": "Stripe", "credential_type": "api_key",
         "credential_fields": [
             {"key": "secret_key", "label": "Secret Key (sk_...)", "required": True},
         ]},
        {"provider": "google_sheets", "name": "Google Sheets", "credential_type": "api_key",
         "credential_fields": [
             {"key": "api_key", "label": "Google API Key", "required": True},
         ]},
        {"provider": "smtp", "name": "SMTP Email", "credential_type": "smtp",
         "credential_fields": [
             {"key": "host", "label": "SMTP Host", "required": True},
             {"key": "port", "label": "Port (587)", "required": True},
             {"key": "username", "label": "Username", "required": True},
             {"key": "password", "label": "Password", "required": True},
             {"key": "from_email", "label": "From Email", "required": False},
         ]},
        {"provider": "generic_webhook", "name": "HTTP Webhook", "credential_type": "api_key",
         "credential_fields": [
             {"key": "url", "label": "Webhook URL", "required": True},
             {"key": "secret_header_name", "label": "Secret Header Name (e.g. X-Secret)", "required": False},
             {"key": "secret_header_value", "label": "Secret Header Value", "required": False},
         ]},
    ]
