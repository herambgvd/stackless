from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import structlog
from jinja2 import Environment, StrictUndefined, TemplateError

from core.config import get_settings

log = structlog.get_logger(__name__)
settings = get_settings()

_jinja_env = Environment(undefined=StrictUndefined, autoescape=True)


class EmailChannel:
    def __init__(self, tenant_id: Optional[str] = None) -> None:
        self._tenant_id = tenant_id

    async def _get_smtp_config(self) -> dict:
        """Return SMTP config — tenant-specific if configured, otherwise global."""
        if self._tenant_id:
            try:
                from apps.tenants.repository import get_tenant_by_id
                tenant = await get_tenant_by_id(self._tenant_id)
                if tenant and tenant.email_config.is_configured:
                    cfg = tenant.email_config
                    return {
                        "host": cfg.smtp_host or settings.SMTP_HOST,
                        "port": cfg.smtp_port,
                        "username": cfg.smtp_username,
                        "password": cfg.smtp_password,
                        "use_tls": cfg.use_tls,
                        "email_from": cfg.email_from or settings.EMAIL_FROM,
                        "email_from_name": cfg.email_from_name,
                    }
            except Exception as exc:
                log.warning("Failed to load tenant email config, falling back to system", exc_info=exc)

        # Global/system fallback
        return {
            "host": settings.SMTP_HOST,
            "port": settings.SMTP_PORT,
            "username": settings.SMTP_USERNAME,
            "password": settings.SMTP_PASSWORD,
            "use_tls": settings.SMTP_USE_TLS,
            "email_from": settings.EMAIL_FROM,
            "email_from_name": None,
        }

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

        cfg = await self._get_smtp_config()

        from_addr = cfg["email_from"]
        from_header = f"{cfg['email_from_name']} <{from_addr}>" if cfg.get("email_from_name") else from_addr

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_header
        msg["To"] = recipient
        msg.attach(MIMEText(body, "html", "utf-8"))

        try:
            if cfg["use_tls"]:
                server = smtplib.SMTP(cfg["host"], cfg["port"])
                server.starttls()
            else:
                server = smtplib.SMTP(cfg["host"], cfg["port"])

            if cfg["username"]:
                server.login(cfg["username"], cfg["password"])

            server.sendmail(from_addr, [recipient], msg.as_string())
            server.quit()
            log.info("Email sent", recipient=recipient, subject=subject, tenant_id=self._tenant_id)
        except smtplib.SMTPException as exc:
            log.error("SMTP error sending email", exc_info=exc, recipient=recipient)
            raise RuntimeError(f"Failed to send email: {exc}") from exc
