from __future__ import annotations

import asyncio
from typing import Any, Optional

import structlog

from celery_worker import celery_app

log = structlog.get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="apps.notifications.tasks.send_notification_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="notifications",
)
def send_notification_task(
    self,
    channel: str,
    recipient: str,
    template_id: Optional[str],
    context: dict[str, Any],
    tenant_id: str,
    subject: Optional[str] = None,
    body: Optional[str] = None,
):
    """Async Celery task to deliver a notification."""
    try:
        from core.database import init_db
        from apps.notifications.service import send_notification

        async def _run():
            await init_db()
            await send_notification(
                channel=channel,
                recipient=recipient,
                template_id=template_id,
                notification_context=context,
                tenant_id=tenant_id,
                subject=subject,
                body=body,
            )

        _run_async(_run())
        log.info("Notification task completed", channel=channel, recipient=recipient)
    except Exception as exc:
        log.error("Notification task failed", exc_info=exc)
        raise self.retry(exc=exc)
