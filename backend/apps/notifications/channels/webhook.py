from __future__ import annotations

from typing import Any

import httpx
import structlog
from jinja2 import Environment, StrictUndefined, TemplateError

log = structlog.get_logger(__name__)

_jinja_env = Environment(undefined=StrictUndefined, autoescape=False)


class WebhookChannel:
    async def send(
        self,
        url: str,
        body_template: str,
        context: dict[str, Any],
        headers: dict[str, str] | None = None,
        method: str = "POST",
    ) -> dict[str, Any]:
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
