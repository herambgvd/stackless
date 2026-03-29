from __future__ import annotations

"""IMAP polling service — fetches unseen emails and stores them as InboundEmail documents."""

import asyncio
import email as email_lib
import imaplib
from datetime import datetime, timezone
from email.header import decode_header
from typing import Optional

import structlog

from apps.email_inbox.models import InboundEmail, InboxConfig

log = structlog.get_logger(__name__)


def _decode_header_str(value: str | bytes | None) -> str:
    if not value:
        return ""
    if isinstance(value, bytes):
        parts = decode_header(value.decode("utf-8", errors="replace"))
    else:
        parts = decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(str(part))
    return " ".join(decoded)


def _extract_body(msg) -> tuple[str, str]:
    """Return (text, html) body from a MIME message."""
    text_body = ""
    html_body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                continue
            if ct == "text/plain" and not text_body:
                try:
                    text_body = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    )
                except Exception:
                    pass
            elif ct == "text/html" and not html_body:
                try:
                    html_body = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    )
                except Exception:
                    pass
    else:
        ct = msg.get_content_type()
        try:
            payload = msg.get_payload(decode=True).decode(
                msg.get_content_charset() or "utf-8", errors="replace"
            )
        except Exception:
            payload = ""
        if ct == "text/html":
            html_body = payload
        else:
            text_body = payload
    return text_body[:50_000], html_body[:100_000]


def _extract_attachments(msg) -> list[dict]:
    attachments = []
    if msg.is_multipart():
        for part in msg.walk():
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                filename = part.get_filename() or "attachment"
                attachments.append({
                    "name": filename,
                    "content_type": part.get_content_type(),
                    "size": len(part.get_payload(decode=True) or b""),
                })
    return attachments


def _poll_imap(config: InboxConfig) -> list[dict]:
    """Synchronous IMAP fetch — runs in executor to avoid blocking the event loop."""
    results = []
    try:
        if config.use_ssl:
            conn = imaplib.IMAP4_SSL(config.imap_host, config.imap_port)
        else:
            conn = imaplib.IMAP4(config.imap_host, config.imap_port)
        conn.login(config.imap_username, config.imap_password)
        conn.select(config.mailbox)

        _, data = conn.search(None, "UNSEEN")
        uids = data[0].split()
        for uid in uids[-50:]:  # process at most 50 at a time
            _, msg_data = conn.fetch(uid, "(RFC822)")
            if not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0][1]
            msg = email_lib.message_from_bytes(raw)

            message_id = msg.get("Message-ID", "").strip()
            if not message_id:
                continue

            subject = _decode_header_str(msg.get("Subject", ""))
            from_raw = msg.get("From", "")
            from_email = email_lib.utils.parseaddr(from_raw)[1]
            from_name = _decode_header_str(email_lib.utils.parseaddr(from_raw)[0])
            to_emails = [e for _, e in email_lib.utils.getaddresses([msg.get("To", "")])]
            cc_emails = [e for _, e in email_lib.utils.getaddresses([msg.get("Cc", "")])]

            text_body, html_body = _extract_body(msg)
            attachments = _extract_attachments(msg)

            date_str = msg.get("Date", "")
            try:
                received_at = email_lib.utils.parsedate_to_datetime(date_str).astimezone(timezone.utc)
            except Exception:
                received_at = datetime.now(tz=timezone.utc)

            results.append({
                "message_id": message_id,
                "subject": subject,
                "from_email": from_email,
                "from_name": from_name,
                "to_emails": to_emails,
                "cc_emails": cc_emails,
                "body_text": text_body,
                "body_html": html_body,
                "attachments": attachments,
                "received_at": received_at,
            })

        conn.logout()
    except Exception as exc:
        log.error("IMAP poll failed", error=str(exc))
    return results


async def poll_inbox(config: InboxConfig) -> int:
    """Poll the IMAP inbox and persist new emails. Returns count of new emails stored."""
    loop = asyncio.get_event_loop()
    raw_emails = await loop.run_in_executor(None, _poll_imap, config)

    saved = 0
    for e in raw_emails:
        # Check for duplicate
        existing = await InboundEmail.find_one(
            InboundEmail.message_id == e["message_id"],
            InboundEmail.tenant_id == config.tenant_id,
        )
        if existing:
            continue

        doc = InboundEmail(
            tenant_id=config.tenant_id,
            **e,
        )
        await doc.insert()
        saved += 1

    # Update last_polled_at
    config.last_polled_at = datetime.now(tz=timezone.utc)
    await config.save()
    log.info("IMAP poll complete", tenant_id=config.tenant_id, new_emails=saved)
    return saved


async def poll_all_active_inboxes() -> dict:
    """Poll every active inbox configuration across all tenants."""
    configs = await InboxConfig.find(InboxConfig.is_active == True).to_list()  # noqa: E712
    results = {}
    for config in configs:
        try:
            count = await poll_inbox(config)
            results[config.tenant_id] = count
        except Exception as exc:
            results[config.tenant_id] = f"error: {exc}"
    return results
