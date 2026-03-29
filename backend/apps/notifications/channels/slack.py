from __future__ import annotations

from typing import Any

import httpx
import structlog
from jinja2 import Environment, StrictUndefined, TemplateError

log = structlog.get_logger(__name__)

_jinja_env = Environment(undefined=StrictUndefined, autoescape=False)


class SlackChannel:
    async def send(
        self,
        webhook_url: str,
        body_template: str,
        context: dict[str, Any],
    ) -> None:
        try:
            text = _jinja_env.from_string(body_template).render(**context)
        except TemplateError as exc:
            raise ValueError(f"Slack template rendering failed: {exc}") from exc

        payload = {"text": text}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(webhook_url, json=payload)
            if response.status_code != 200:
                raise RuntimeError(
                    f"Slack webhook returned {response.status_code}: {response.text}"
                )

        log.info("Slack message sent", webhook_url=webhook_url[:40] + "...")
