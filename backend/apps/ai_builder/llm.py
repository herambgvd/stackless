from __future__ import annotations

import json
import re
from typing import AsyncGenerator, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from apps.ai_builder.models import ChatMessage, TenantAIConfig
from apps.ai_builder.schemas import AppBlueprint
from core.exceptions import ValidationError


# ─── System prompt ────────────────────────────────────────────────────────────

_BLUEPRINT_SCHEMA = json.dumps(AppBlueprint.model_json_schema(), indent=2)

SYSTEM_PROMPT = f"""You are FlowForge AI — an intelligent assistant that helps users design and build \
no-code applications on the FlowForge platform.

## Your role
Guide users through describing their app requirements via conversation. Ask clarifying questions, \
suggest appropriate field types, and help them think through their data model. Once you have a clear \
picture, generate the full app blueprint.

## FlowForge field types
text, number, email, phone, url, date, datetime, boolean, select, multiselect, \
file, rich_text, currency — pick the most appropriate for each piece of data.

For **select** and **multiselect** fields always include an `options` list in the `config` dict, e.g.:
  "config": {{"options": ["Open", "In Progress", "Closed"]}}

## Conversation style
- Be concise and friendly.
- Ask at most 2–3 clarifying questions at a time.
- When you have enough information, summarise what you will create and ask the user to confirm \
  by typing "generate" or clicking the Generate App button.

## Generating the blueprint
When the user confirms (says "yes", "generate", "create", "looks good", "go ahead", etc.), \
respond with **ONLY** the raw JSON object below — no markdown fences, no explanation text, \
nothing before or after the JSON:

Blueprint JSON schema:
{_BLUEPRINT_SCHEMA}

Rules for the JSON:
- `slug` must be kebab-case (e.g. "customer-support-portal")
- Model `slug` fields must be snake_case (e.g. "support_ticket")
- Field `name` must be snake_case (e.g. "customer_email")
- Use descriptive labels and include a short `description` config value on complex fields
- Include at least one model with at least two fields
"""


# ─── LLM factory ──────────────────────────────────────────────────────────────

def build_llm(config: TenantAIConfig, api_key: str):
    """Return a streaming-capable LangChain chat model for the tenant's provider."""
    if config.provider == "openai":
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            raise ValidationError("langchain-openai is not installed on this server.")
        return ChatOpenAI(
            model=config.model_name,
            api_key=api_key,
            temperature=0.4,
            streaming=True,
        )

    if config.provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
        except ImportError:
            raise ValidationError("langchain-anthropic is not installed on this server.")
        return ChatAnthropic(
            model=config.model_name,
            api_key=api_key,
            temperature=0.4,
            streaming=True,
        )

    if config.provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            raise ValidationError("langchain-ollama is not installed on this server.")
        return ChatOllama(
            model=config.model_name,
            base_url=config.ollama_base_url or "http://localhost:11434",
            temperature=0.4,
        )

    raise ValidationError(f"Unknown provider: {config.provider}")


# ─── Message conversion ────────────────────────────────────────────────────────

def to_langchain_messages(history: list[ChatMessage], new_user_message: str) -> list:
    lc: list = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in history:
        if msg.role == "user":
            lc.append(HumanMessage(content=msg.content))
        else:
            lc.append(AIMessage(content=msg.content))
    lc.append(HumanMessage(content=new_user_message))
    return lc


# ─── Streaming ────────────────────────────────────────────────────────────────

async def stream_response(
    llm,
    history: list[ChatMessage],
    user_message: str,
) -> AsyncGenerator[str, None]:
    """Yield raw text tokens from the LLM."""
    messages = to_langchain_messages(history, user_message)
    async for chunk in llm.astream(messages):
        token = chunk.content
        if token:
            yield token


# ─── Blueprint extraction ─────────────────────────────────────────────────────

def extract_blueprint(text: str) -> Optional[AppBlueprint]:
    """
    Try to parse an AppBlueprint from the LLM's full response.
    Handles both raw JSON and JSON wrapped in markdown code fences.
    Returns None if the text is not a valid blueprint.
    """
    # Strip markdown code fences if present
    fenced = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    candidate = fenced.group(1).strip() if fenced else text.strip()

    # Must start with { to be JSON
    if not candidate.startswith("{"):
        return None

    try:
        data = json.loads(candidate)
        return AppBlueprint.model_validate(data)
    except Exception:
        return None


def auto_title(user_message: str) -> str:
    """Generate a short session title from the first user message."""
    words = user_message.strip().split()
    title = " ".join(words[:8])
    return title if len(title) <= 60 else title[:57] + "…"
