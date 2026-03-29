from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.notifications.models import NotificationLog, NotificationStatus, NotificationTemplate


async def get_template_by_id(template_id: str) -> Optional[NotificationTemplate]:
    try:
        oid = PydanticObjectId(template_id)
    except Exception:
        return None
    return await NotificationTemplate.get(oid)


async def list_templates(tenant_id: str) -> list[NotificationTemplate]:
    return await NotificationTemplate.find(NotificationTemplate.tenant_id == tenant_id).to_list()


async def create_template(
    *,
    name: str,
    tenant_id: str,
    channel: str,
    subject_template: str,
    body_template: str,
    variables: list[str],
) -> NotificationTemplate:
    t = NotificationTemplate(
        name=name,
        tenant_id=tenant_id,
        channel=channel,  # type: ignore
        subject_template=subject_template,
        body_template=body_template,
        variables=variables,
    )
    await t.insert()
    return t


async def update_template(template: NotificationTemplate, **kwargs) -> NotificationTemplate:
    for key, value in kwargs.items():
        if hasattr(template, key):
            setattr(template, key, value)
    template.updated_at = datetime.now(tz=timezone.utc)
    await template.save()
    return template


async def delete_template(template_id: str) -> bool:
    t = await get_template_by_id(template_id)
    if t is None:
        return False
    await t.delete()
    return True


async def create_log(
    *,
    tenant_id: str,
    channel: str,
    recipient: str,
    template_id: Optional[str],
    status: NotificationStatus,
    payload: dict,
    subject: str = "",
    error: Optional[str] = None,
) -> NotificationLog:
    log = NotificationLog(
        tenant_id=tenant_id,
        channel=channel,  # type: ignore
        recipient=recipient,
        subject=subject,
        template_id=template_id,
        status=status,
        sent_at=datetime.now(tz=timezone.utc) if status == NotificationStatus.SENT else None,
        error=error,
        payload=payload,
    )
    await log.insert()

    # Push real-time signal for in-app notifications via Redis pub/sub
    if channel == "in_app" and status == NotificationStatus.SENT:
        try:
            import json
            import redis.asyncio as aioredis
            from core.config import get_settings
            _r = aioredis.from_url(get_settings().REDIS_URL, decode_responses=True)
            await _r.publish(
                f"notifications:{recipient}",
                json.dumps({"id": str(log.id), "subject": subject}),
            )
            await _r.aclose()
        except Exception:
            pass  # Never block notification delivery for a pub/sub failure

    return log


async def list_logs(tenant_id: str, skip: int = 0, limit: int = 100) -> list[NotificationLog]:
    return await NotificationLog.find(
        NotificationLog.tenant_id == tenant_id
    ).skip(skip).limit(limit).to_list()


async def list_inbox_logs(
    recipient: str,
    tenant_id: str,
    unread_only: bool = False,
    limit: int = 50,
) -> list[NotificationLog]:
    from apps.notifications.models import NotificationChannel
    conditions = [
        NotificationLog.tenant_id == tenant_id,
        NotificationLog.recipient == recipient,
        NotificationLog.channel == NotificationChannel.IN_APP,
    ]
    if unread_only:
        conditions.append(NotificationLog.is_read == False)  # noqa: E712
    return (
        await NotificationLog.find(*conditions)
        .sort(-NotificationLog.created_at)
        .limit(limit)
        .to_list()
    )


async def mark_log_read(log_id: str) -> Optional[NotificationLog]:
    try:
        oid = PydanticObjectId(log_id)
    except Exception:
        return None
    log = await NotificationLog.get(oid)
    if log is None:
        return None
    log.is_read = True
    await log.save()
    return log
