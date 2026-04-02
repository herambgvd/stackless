from __future__ import annotations

import ipaddress
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog
from jinja2 import Environment, StrictUndefined, TemplateError

log = structlog.get_logger(__name__)

_jinja_env = Environment(undefined=StrictUndefined, autoescape=False)

# Block internal/private networks to prevent SSRF
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _validate_webhook_url(url: str) -> None:
    """Validate webhook URL is not pointing to internal networks."""
    parsed = urlparse(url)
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid webhook URL scheme: {parsed.scheme}")
    if not parsed.hostname:
        raise ValueError("Webhook URL must have a hostname.")

    hostname = parsed.hostname
    # Block common internal hostnames
    blocked_hosts = {"localhost", "0.0.0.0", "metadata.google.internal", "169.254.169.254"}
    if hostname in blocked_hosts:
        raise ValueError(f"Webhook URL blocked: {hostname} is an internal address.")

    # Resolve and check IP
    import socket
    try:
        ip_str = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_str)
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise ValueError(f"Webhook URL blocked: {hostname} resolves to private IP {ip_str}.")
    except socket.gaierror:
        raise ValueError(f"Webhook URL blocked: cannot resolve hostname {hostname}.")


class WebhookChannel:
    async def send(
        self,
        url: str,
        body_template: str,
        context: dict[str, Any],
        headers: dict[str, str] | None = None,
        method: str = "POST",
    ) -> dict[str, Any]:
        _validate_webhook_url(url)
        try:
            rendered = _jinja_env.from_string(body_template).render(**context)
        except TemplateError as exc:
            raise ValueError(f"Webhook template rendering failed: {exc}") from exc

        import json

        try:
            payload = json.loads(rendered)
        except json.JSONDecodeError:
            payload = {"message": rendered}

        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method.upper(),
                url,
                json=payload,
                headers=request_headers,
            )
            response.raise_for_status()

        log.info("Webhook delivered", url=url, status=response.status_code)
        try:
            return response.json()
        except Exception:
            return {"status_code": response.status_code, "text": response.text}
