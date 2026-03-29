from __future__ import annotations

"""Email digest — summarises pending tasks, approvals and unread notifications per user.

Intended to be triggered by an external cron (e.g. daily at 08:00) via:
  POST /api/v1/admin/trigger-digest?frequency=daily
"""

import asyncio
from datetime import datetime, timezone
from typing import Literal

import structlog

from apps.notifications.channels.email import EmailChannel
from apps.notifications.preferences import NotificationPreference

log = structlog.get_logger(__name__)
_email = EmailChannel()


_DIGEST_TEMPLATE = """
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
<h2 style="margin-bottom:4px">Your daily summary</h2>
<p style="color:#666;margin-top:0">{date}</p>

{% if tasks %}
<h3>📋 Tasks assigned to you ({task_count})</h3>
<ul>
{% for t in tasks %}
  <li style="margin-bottom:4px"><strong>{t.title}</strong> — {t.model} / {t.app}</li>
{% endfor %}
</ul>
{% endif %}

{% if approvals %}
<h3>✅ Pending approvals ({approval_count})</h3>
<ul>
{% for a in approvals %}
  <li style="margin-bottom:4px"><strong>{a.title}</strong> — {a.flow}</li>
{% endfor %}
</ul>
{% endif %}

{% if unread_count %}
<h3>🔔 Unread notifications ({unread_count})</h3>
<p>You have {unread_count} unread notification(s) in your inbox.</p>
{% endif %}

{% if not tasks and not approvals and not unread_count %}
<p>Nothing pending — you're all caught up! 🎉</p>
{% endif %}

<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
<p style="color:#999;font-size:12px">
  You're receiving this because you enabled daily digest emails.
  <a href="#">Unsubscribe</a>
</p>
</body></html>
"""


async def _build_digest_for_user(user_id: str, tenant_id: str) -> dict:
    """Gather task, approval, and notification counts for a user."""
    from apps.human_tasks.models import HumanTask
    from apps.approval_engine.models import ApprovalRequest
    from apps.notifications.models import NotificationLog, NotificationChannel

    tasks = await HumanTask.find(
        HumanTask.assigned_to == user_id,
        HumanTask.tenant_id == tenant_id,
        HumanTask.status == "open",
    ).to_list()

    approvals = await ApprovalRequest.find(
        ApprovalRequest.tenant_id == tenant_id,
        ApprovalRequest.status == "pending",
        # at least one step assigned to this user — check pending_approver_ids if present
    ).to_list()

    unread = await NotificationLog.find(
        NotificationLog.tenant_id == tenant_id,
        NotificationLog.recipient == user_id,
        NotificationLog.channel == NotificationChannel.IN_APP,
        NotificationLog.is_read == False,  # noqa: E712
    ).count()

    return {
        "tasks": [{"title": t.title, "model": t.model_slug or "", "app": t.app_id or ""} for t in tasks],
        "approvals": [{"title": str(a.id)[:8], "flow": a.flow_id or ""} for a in approvals],
        "unread_count": unread,
    }


async def send_digest_for_user(user_id: str, tenant_id: str, user_email: str, user_name: str) -> None:
    try:
        summary = await _build_digest_for_user(user_id, tenant_id)
        if not summary["tasks"] and not summary["approvals"] and not summary["unread_count"]:
            return  # nothing to report — skip

        date_str = datetime.now(tz=timezone.utc).strftime("%A, %B %d, %Y")
        body = _DIGEST_TEMPLATE.replace("{date}", date_str)
        body = body.replace("{task_count}", str(len(summary["tasks"])))
        body = body.replace("{approval_count}", str(len(summary["approvals"])))
        body = body.replace("{unread_count}", str(summary["unread_count"]))

        # Simple list rendering (no Jinja since we already replaced vars above)
        task_items = "".join(
            f"<li style='margin-bottom:4px'><strong>{t['title']}</strong></li>"
            for t in summary["tasks"]
        )
        approval_items = "".join(
            f"<li style='margin-bottom:4px'><strong>{a['title']}</strong></li>"
            for a in summary["approvals"]
        )
        body = body.replace(
            "{% if tasks %}\n<h3>📋 Tasks assigned to you ({task_count})</h3>\n<ul>\n{% for t in tasks %}\n  <li style=\"margin-bottom:4px\"><strong>{t.title}</strong> — {t.model} / {t.app}</li>\n{% endfor %}\n</ul>\n{% endif %}",
            (f"<h3>📋 Tasks assigned to you ({len(summary['tasks'])})</h3><ul>{task_items}</ul>" if summary["tasks"] else ""),
        )
        body = body.replace(
            "{% if approvals %}\n<h3>✅ Pending approvals ({approval_count})</h3>\n<ul>\n{% for a in approvals %}\n  <li style=\"margin-bottom:4px\"><strong>{a.title}</strong> — {a.flow}</li>\n{% endfor %}\n</ul>\n{% endif %}",
            (f"<h3>✅ Pending approvals ({len(summary['approvals'])})</h3><ul>{approval_items}</ul>" if summary["approvals"] else ""),
        )
        body = body.replace("{% if unread_count %}", "").replace("{% endif %}", "").replace("{% if not tasks and not approvals and not unread_count %}", "").replace("{% for t in tasks %}", "").replace("{% endfor %}", "").replace("{% for a in approvals %}", "")

        await _email.send(
            recipient=user_email,
            subject_template="Your daily summary — FlowForge",
            body_template=body,
            context={},
        )
        log.info("Digest sent", user_id=user_id, tenant_id=tenant_id)
    except Exception as exc:
        log.warning("Failed to send digest", user_id=user_id, error=str(exc))


async def send_digests(frequency: Literal["daily", "weekly"] = "daily") -> int:
    """Send digest emails to all users who opted in for the given frequency.
    Returns number of emails attempted."""
    from apps.auth.models import User  # type: ignore[import]

    prefs = await NotificationPreference.find(
        NotificationPreference.email_digest == True,  # noqa: E712
        NotificationPreference.digest_frequency == frequency,
    ).to_list()

    count = 0
    for pref in prefs:
        user = await User.get(pref.user_id) if hasattr(User, "get") else None
        if user is None:
            try:
                from apps.auth.repository import get_user_by_id
                user = await get_user_by_id(pref.user_id)
            except Exception:
                continue
        if not user or not user.email:
            continue
        asyncio.ensure_future(send_digest_for_user(
            user_id=pref.user_id,
            tenant_id=pref.tenant_id,
            user_email=user.email,
            user_name=user.full_name or user.email,
        ))
        count += 1

    return count
