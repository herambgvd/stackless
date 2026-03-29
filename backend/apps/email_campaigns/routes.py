from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query, status

from apps.email_campaigns.models import CampaignSendLog, CampaignStatus, EmailCampaign
from apps.email_campaigns.schemas import (
    CampaignCreate,
    CampaignResponse,
    CampaignUpdate,
)
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


def _to_response(c: EmailCampaign) -> CampaignResponse:
    return CampaignResponse(
        id=str(c.id),
        tenant_id=c.tenant_id,
        name=c.name,
        subject=c.subject,
        body_html=c.body_html,
        from_name=c.from_name,
        from_email=c.from_email,
        contacts=[{"email": e.email, "name": e.name, "variables": e.variables} for e in c.contacts],
        model_app_id=c.model_app_id,
        model_slug=c.model_slug,
        email_field=c.email_field,
        name_field=c.name_field,
        status=c.status,
        scheduled_at=c.scheduled_at,
        sent_at=c.sent_at,
        total_recipients=c.total_recipients,
        sent_count=c.sent_count,
        failed_count=c.failed_count,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/campaigns", response_model=list[CampaignResponse])
async def list_campaigns(
    status_filter: str = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("notifications", "read")),
):
    filters = [EmailCampaign.tenant_id == tenant_id]
    if status_filter:
        filters.append(EmailCampaign.status == status_filter)
    skip = (page - 1) * page_size
    items = await EmailCampaign.find(*filters).sort(-EmailCampaign.created_at).skip(skip).limit(page_size).to_list()
    return [_to_response(c) for c in items]


@router.post("/campaigns", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("notifications", "create")),
):
    from apps.email_campaigns.models import ContactListEntry
    c = EmailCampaign(
        tenant_id=tenant_id,
        name=payload.name,
        subject=payload.subject,
        body_html=payload.body_html,
        from_name=payload.from_name,
        from_email=payload.from_email,
        contacts=[ContactListEntry(email=e.email, name=e.name, variables=e.variables) for e in payload.contacts],
        model_app_id=payload.model_app_id,
        model_slug=payload.model_slug,
        email_field=payload.email_field,
        name_field=payload.name_field,
        scheduled_at=payload.scheduled_at,
        created_by=str(current_user.id),
    )
    await c.insert()
    return _to_response(c)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("notifications", "read")),
):
    try:
        oid = PydanticObjectId(campaign_id)
    except Exception:
        raise NotFoundError("EmailCampaign", campaign_id)
    c = await EmailCampaign.get(oid)
    if not c or c.tenant_id != tenant_id:
        raise NotFoundError("EmailCampaign", campaign_id)
    return _to_response(c)


@router.put("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("notifications", "update")),
):
    from apps.email_campaigns.models import ContactListEntry
    try:
        oid = PydanticObjectId(campaign_id)
    except Exception:
        raise NotFoundError("EmailCampaign", campaign_id)
    c = await EmailCampaign.get(oid)
    if not c or c.tenant_id != tenant_id:
        raise NotFoundError("EmailCampaign", campaign_id)
    if c.status not in (CampaignStatus.DRAFT, CampaignStatus.SCHEDULED):
        from fastapi import HTTPException
        raise HTTPException(400, "Cannot edit a campaign that is already sending or sent.")

    data = payload.model_dump(exclude_none=True)
    if "contacts" in data:
        data["contacts"] = [ContactListEntry(**e) for e in data["contacts"]]
    for k, v in data.items():
        setattr(c, k, v)
    c.updated_at = datetime.now(tz=timezone.utc)
    await c.save()
    return _to_response(c)


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("notifications", "delete")),
):
    try:
        oid = PydanticObjectId(campaign_id)
    except Exception:
        raise NotFoundError("EmailCampaign", campaign_id)
    c = await EmailCampaign.get(oid)
    if not c or c.tenant_id != tenant_id:
        raise NotFoundError("EmailCampaign", campaign_id)
    await c.delete()


@router.post("/campaigns/{campaign_id}/send", status_code=status.HTTP_202_ACCEPTED)
async def send_campaign_endpoint(
    campaign_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("notifications", "create")),
):
    """Trigger an immediate send of the campaign (fire-and-forget in background)."""
    from apps.email_campaigns.service import send_campaign

    try:
        oid = PydanticObjectId(campaign_id)
    except Exception:
        raise NotFoundError("EmailCampaign", campaign_id)
    c = await EmailCampaign.get(oid)
    if not c or c.tenant_id != tenant_id:
        raise NotFoundError("EmailCampaign", campaign_id)
    if c.status == CampaignStatus.SENDING:
        from fastapi import HTTPException
        raise HTTPException(400, "Campaign is already sending.")
    if c.status == CampaignStatus.SENT:
        from fastapi import HTTPException
        raise HTTPException(400, "Campaign has already been sent.")

    # Atomically mark as SENDING before dispatching to prevent double-send
    c.status = CampaignStatus.SENDING
    await c.save()
    asyncio.ensure_future(send_campaign(campaign_id, tenant_id))
    return {"detail": "Campaign send started.", "campaign_id": campaign_id}


@router.get("/campaigns/{campaign_id}/logs")
async def get_campaign_logs(
    campaign_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("notifications", "read")),
):
    skip = (page - 1) * page_size
    logs = await CampaignSendLog.find(
        CampaignSendLog.campaign_id == campaign_id,
        CampaignSendLog.tenant_id == tenant_id,
    ).skip(skip).limit(page_size).to_list()
    total = await CampaignSendLog.find(
        CampaignSendLog.campaign_id == campaign_id,
        CampaignSendLog.tenant_id == tenant_id,
    ).count()
    return {
        "total": total,
        "items": [
            {"email": l.email, "name": l.name, "status": l.status, "error": l.error, "sent_at": l.sent_at}
            for l in logs
        ],
    }
