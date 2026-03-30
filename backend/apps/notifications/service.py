from __future__ import annotations

from typing import Any, Optional

import structlog

from apps.notifications.models import NotificationChannel, NotificationStatus
from apps.notifications.repository import (
    create_log,
    get_template_by_id,
)

log = structlog.get_logger(__name__)


async def send_notification(
    channel: str,
    recipient: str,
    template_id: Optional[str],
    notification_context: dict[str, Any],
    tenant_id: str,
    subject: Optional[str] = None,
    body: Optional[str] = None,
) -> None:
    """Dispatch a notification through the appropriate channel."""

    template = None
    subject_tmpl = subject or ""
    body_tmpl = body or ""

    if template_id:
        template = await get_template_by_id(template_id)
        if template:
            subject_tmpl = template.subject_template or subject_tmpl
            body_tmpl = template.body_template or body_tmpl

    status = NotificationStatus.PENDING
    error_msg: Optional[str] = None

    try:
        if channel == NotificationChannel.EMAIL:
            from apps.notifications.channels.email import EmailChannel

            await EmailChannel(tenant_id=tenant_id or None).send(
                recipient=recipient,
                subject_template=subject_tmpl,
                body_template=body_tmpl,
                context=notification_context,
            )

        elif channel == NotificationChannel.SLACK:
            from apps.notifications.channels.slack import SlackChannel
            from core.config import get_settings

            cfg = get_settings()
            webhook_url = notification_context.get("slack_webhook_url") or cfg.SLACK_DEFAULT_WEBHOOK_URL
            await SlackChannel().send(
                webhook_url=webhook_url,
                body_template=body_tmpl,
                context=notification_context,
            )

        elif channel == NotificationChannel.WEBHOOK:
            from apps.notifications.channels.webhook import WebhookChannel

            url = notification_context.get("webhook_url") or recipient
            await WebhookChannel().send(
                url=url,
                body_template=body_tmpl,
                context=notification_context,
            )

        elif channel == NotificationChannel.IN_APP:
            # In-app notifications are stored in the log directly
            log.info("In-app notification created", recipient=recipient)

        status = NotificationStatus.SENT

    except Exception as exc:
        log.error("Notification delivery failed", exc_info=exc, channel=channel, recipient=recipient)
        status = NotificationStatus.FAILED
        error_msg = str(exc)

    # Render subject/body with Jinja2 (best-effort — fall back to raw template on error)
    from jinja2 import Environment, Undefined
    _jinja = Environment(undefined=Undefined, autoescape=True)
    try:
        rendered_subject = _jinja.from_string(subject_tmpl).render(**notification_context)
    except Exception:
        rendered_subject = subject_tmpl
    try:
        rendered_body = _jinja.from_string(body_tmpl).render(**notification_context)
    except Exception:
        rendered_body = body_tmpl

    await create_log(
        tenant_id=tenant_id,
        channel=channel,
        recipient=recipient,
        subject=rendered_subject,
        template_id=template_id,
        status=status,
        payload={"subject": rendered_subject, "body": rendered_body, "context": notification_context},
        error=error_msg,
    )
