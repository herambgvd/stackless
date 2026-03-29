from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from apps.schema_engine.models import FieldType


# ─── AI Config ────────────────────────────────────────────────────────────────

class AIConfigCreate(BaseModel):
    provider: Literal["openai", "anthropic", "ollama"]
    model_name: str = Field(min_length=1, max_length=100)
    api_key: Optional[str] = None       # Plaintext; stored encrypted
    ollama_base_url: Optional[str] = None


class AIConfigResponse(BaseModel):
    id: str
    tenant_id: str
    provider: str
    model_name: str
    has_api_key: bool
    ollama_base_url: Optional[str] = None
    updated_at: datetime


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    session_id: Optional[str] = None   # None → start a new session


class ChatMessageSchema(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class ChatSessionResponse(BaseModel):
    session_id: str
    title: str
    status: str
    messages: list[ChatMessageSchema]
    blueprint: Optional[dict] = None
    app_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SessionListItem(BaseModel):
    session_id: str
    title: str
    status: str
    message_count: int
    app_id: Optional[str] = None
    updated_at: datetime


# ─── App Blueprint ─────────────────────────────────────────────────────────────
# This is the structured schema the LLM emits and we persist + materialise.

class BlueprintFieldSpec(BaseModel):
    name: str = Field(description="snake_case field key, e.g. customer_name")
    label: str = Field(description="Human-readable label shown in the UI")
    type: FieldType = Field(description="One of the supported FieldType values")
    is_required: bool = False
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra config: placeholder, description, options (for select/multiselect)"
    )
    order: int = 0


class BlueprintModelSpec(BaseModel):
    name: str = Field(description="Human-readable model name, e.g. Support Ticket")
    slug: str = Field(description="snake_case identifier, e.g. support_ticket")
    plural_name: str = Field(description="Plural label, e.g. Support Tickets")
    icon: str = "table"
    fields: list[BlueprintFieldSpec]

    @field_validator("slug")
    @classmethod
    def slug_must_be_snake(cls, v: str) -> str:
        v = v.lower().replace(" ", "_").replace("-", "_")
        v = re.sub(r"[^a-z0-9_]", "", v)
        return v


class AppBlueprint(BaseModel):
    name: str = Field(description="Title-case app name, e.g. Customer Support Portal")
    slug: str = Field(description="kebab-case URL identifier, e.g. customer-support-portal")
    description: str
    icon: str = "box"
    color: str = "#6366f1"
    models: list[BlueprintModelSpec]

    @field_validator("slug")
    @classmethod
    def slug_must_be_kebab(cls, v: str) -> str:
        v = v.lower().replace(" ", "-").replace("_", "-")
        v = re.sub(r"[^a-z0-9-]", "", v)
        return v


# ─── Generate ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    session_id: str


class GenerateResponse(BaseModel):
    session_id: str
    app_id: str
    app_name: str
    app_slug: str
    blueprint: dict   # raw blueprint dict for display
