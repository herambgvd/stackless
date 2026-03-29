from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import structlog
from jinja2 import Environment, StrictUndefined, TemplateError

from core.config import get_settings

log = structlog.get_logger(__name__)
settings = get_settings()

_jinja_env = Environment(undefined=StrictUndefined, autoescape=True)


class EmailChannel:
    async def send(
        self,
        recipient: str,
        subject_template: str,
        body_template: str,
        context: dict[str, Any],
    ) -> None:
        try:
            subject = _jinja_env.from_string(subject_template).render(**context)
            body = _jinja_env.from_string(body_template).render(**context)
        except TemplateError as exc:
            raise ValueError(f"Email template rendering failed: {exc}") from exc

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = recipient
        msg.attach(MIMEText(body, "html", "utf-8"))

        try:
            if settings.SMTP_USE_TLS:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
                server.starttls()
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)

            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

            server.sendmail(settings.EMAIL_FROM, [recipient], msg.as_string())
            server.quit()
            log.info("Email sent", recipient=recipient, subject=subject)
        except smtplib.SMTPException as exc:
            log.error("SMTP error sending email", exc_info=exc, recipient=recipient)
            raise RuntimeError(f"Failed to send email: {exc}") from exc
