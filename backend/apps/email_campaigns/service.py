from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

import structlog

_log = structlog.get_logger(__name__)

from jinja2 import Environment as _JinjaEnv

from apps.email_campaigns.models import CampaignSendLog, CampaignStatus, EmailCampaign
from apps.notifications.channels.email import EmailChannel

_email_channel = EmailChannel()


async def _resolve_contacts(campaign: EmailCampaign, tenant_id: str) -> list[dict]:
    """Return list of {email, name, variables} dicts from static list or model query."""
    contacts = [{"email": c.email, "name": c.name or "", "variables": c.variables}
                for c in campaign.contacts]

    if campaign.model_slug and campaign.email_field and campaign.model_app_id:
        from apps.schema_engine.service import list_records
        try:
            result = await list_records(
                campaign.model_slug,
                campaign.model_app_id,
                tenant_id,
                page=1,
                page_size=5000,
            )
            for rec in result.get("items", []):
                email = rec.get("data", {}).get(campaign.email_field)
                if not email:
                    continue
                name = rec.get("data", {}).get(campaign.name_field or "", "") or ""
                contacts.append({"email": email, "name": name, "variables": rec.get("data", {})})
        except Exception as exc:
            _log.error("Failed to resolve model contacts for campaign", campaign_id=str(campaign.id), exc_info=exc)

    # Deduplicate by email
    seen: set[str] = set()
    unique = []
    for c in contacts:
        if c["email"] not in seen:
            seen.add(c["email"])
            unique.append(c)
    return unique


async def send_campaign(campaign_id: str, tenant_id: str) -> None:
    """Execute a campaign — resolve recipients, send emails, update counters."""
    from beanie import PydanticObjectId

    try:
        oid = PydanticObjectId(campaign_id)
    except Exception:
        return
    campaign = await EmailCampaign.get(oid)
    if not campaign or campaign.tenant_id != tenant_id:
        return

    campaign.status = CampaignStatus.SENDING
    campaign.updated_at = datetime.now(tz=timezone.utc)
    await campaign.save()

    contacts = await _resolve_contacts(campaign, tenant_id)
    campaign.total_recipients = len(contacts)
    await campaign.save()

    sent = 0
    failed = 0

    for contact in contacts:
        try:
            body = _JinjaEnv(autoescape=True).from_string(campaign.body_html).render(
                name=contact["name"],
                **contact["variables"],
            )
            await _email_channel.send(
                recipient=contact["email"],
                subject_template=campaign.subject,
                body_template=body,
                context={},
            )
            log = CampaignSendLog(
                campaign_id=campaign_id,
                tenant_id=tenant_id,
                email=contact["email"],
                name=contact["name"],
                status="sent",
                sent_at=datetime.now(tz=timezone.utc),
            )
            sent += 1
        except Exception as exc:
            log = CampaignSendLog(
                campaign_id=campaign_id,
                tenant_id=tenant_id,
                email=contact["email"],
                name=contact["name"],
                status="failed",
                error=str(exc)[:300],
            )
            failed += 1
        await log.insert()
        await asyncio.sleep(0.02)  # light throttle

    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.status = CampaignStatus.SENT
    campaign.sent_at = datetime.now(tz=timezone.utc)
    campaign.updated_at = datetime.now(tz=timezone.utc)
    await campaign.save()
