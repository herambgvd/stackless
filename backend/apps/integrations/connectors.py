from __future__ import annotations
import asyncio
from typing import Any
import httpx


async def send_slack_message(credentials: dict, config: dict, context: dict) -> dict:
    """Send a Slack message via Incoming Webhook or Bot API."""
    token = credentials.get("bot_token")
    webhook_url = credentials.get("webhook_url")
    channel = _resolve(config.get("channel", "#general"), context)
    text = _resolve(config.get("message", ""), context)

    if webhook_url:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json={"text": text})
            resp.raise_for_status()
            return {"sent": True, "channel": channel}
    elif token:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {token}"},
                json={"channel": channel, "text": text},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                raise RuntimeError(f"Slack error: {data.get('error')}")
            return {"sent": True, "channel": channel, "ts": data.get("ts")}
    else:
        raise ValueError("Slack integration requires 'bot_token' or 'webhook_url' credential.")


async def send_whatsapp_message(credentials: dict, config: dict, context: dict) -> dict:
    """Send WhatsApp message via Twilio."""
    account_sid = credentials.get("account_sid", "")
    auth_token = credentials.get("auth_token", "")
    from_number = credentials.get("from_number", "")
    to = _resolve(config.get("to", ""), context)
    body = _resolve(config.get("message", ""), context)

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            auth=(account_sid, auth_token),
            data={"From": f"whatsapp:{from_number}", "To": f"whatsapp:{to}", "Body": body},
        )
        resp.raise_for_status()
        data = resp.json()
        return {"sent": True, "sid": data.get("sid"), "status": data.get("status")}


async def stripe_create_payment(credentials: dict, config: dict, context: dict) -> dict:
    """Create a Stripe Payment Link."""
    secret_key = credentials.get("secret_key", "")
    amount_cents = int(float(_resolve(config.get("amount", 0), context)) * 100)
    currency = config.get("currency", "usd").lower()
    product_name = _resolve(config.get("product_name", "Payment"), context)

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Create price first
        price_resp = await client.post(
            "https://api.stripe.com/v1/prices",
            auth=(secret_key, ""),
            data={
                "currency": currency,
                "unit_amount": amount_cents,
                "product_data[name]": product_name,
            },
        )
        price_resp.raise_for_status()
        price_id = price_resp.json()["id"]

        # Create payment link
        link_resp = await client.post(
            "https://api.stripe.com/v1/payment_links",
            auth=(secret_key, ""),
            data={"line_items[0][price]": price_id, "line_items[0][quantity]": "1"},
        )
        link_resp.raise_for_status()
        link_data = link_resp.json()
        return {"payment_link_url": link_data["url"], "link_id": link_data["id"]}


async def google_sheets_append(credentials: dict, config: dict, context: dict) -> dict:
    """Append a row to a Google Sheet via API."""
    api_key = credentials.get("api_key", "")
    spreadsheet_id = _resolve(config.get("spreadsheet_id", ""), context)
    sheet_name = config.get("sheet_name", "Sheet1")
    values = config.get("values", [])
    resolved_values = [_resolve(v, context) for v in values]

    url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{sheet_name}!A1:append"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            params={"valueInputOption": "RAW", "key": api_key},
            json={"values": [resolved_values]},
        )
        resp.raise_for_status()
        data = resp.json()
        return {"appended": True, "updates": data.get("updates", {})}


async def send_email_smtp(credentials: dict, config: dict, context: dict) -> dict:
    """Send email via SMTP (using smtplib in a thread)."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    host = credentials.get("host", "smtp.gmail.com")
    port = int(credentials.get("port", 587))
    username = credentials.get("username", "")
    password = credentials.get("password", "")
    from_email = credentials.get("from_email", username)

    to = _resolve(config.get("to", ""), context)
    subject = _resolve(config.get("subject", ""), context)
    body = _resolve(config.get("body", ""), context)
    is_html = config.get("is_html", False)

    msg = MIMEMultipart("alternative")
    msg["From"] = from_email
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html" if is_html else "plain"))

    def _send():
        with smtplib.SMTP(host, port) as server:
            server.ehlo()
            server.starttls()
            server.login(username, password)
            server.sendmail(from_email, [to], msg.as_string())

    await asyncio.get_event_loop().run_in_executor(None, _send)
    return {"sent": True, "to": to, "subject": subject}


async def send_generic_webhook(credentials: dict, config: dict, context: dict) -> dict:
    """Send an HTTP request to a generic webhook URL."""
    url = _resolve(config.get("url", credentials.get("url", "")), context)
    method = config.get("method", "POST").upper()
    headers = {k: _resolve(v, context) for k, v in (config.get("headers") or {}).items()}
    # Optional secret header
    if credentials.get("secret_header_name") and credentials.get("secret_header_value"):
        headers[credentials["secret_header_name"]] = credentials["secret_header_value"]
    payload_template = config.get("payload")
    if payload_template and isinstance(payload_template, dict):
        body = {k: _resolve(v, context) for k, v in payload_template.items()}
    else:
        body = {k: v for k, v in context.items() if isinstance(v, (str, int, float, bool))}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request(method, url, json=body, headers=headers)
        resp.raise_for_status()
        try:
            return {"sent": True, "status_code": resp.status_code, "response": resp.json()}
        except Exception:
            return {"sent": True, "status_code": resp.status_code}


def _resolve(value: Any, context: dict) -> Any:
    """Resolve {{var}} template references from context."""
    if isinstance(value, str) and "{{" in value and "}}" in value:
        import re
        def _replace(m):
            key = m.group(1).strip()
            return str(context.get(key, m.group(0)))
        return re.sub(r"\{\{(.+?)\}\}", _replace, value)
    return value
