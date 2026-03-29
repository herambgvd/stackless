from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class TenantAIConfig(Document):
    tenant_id: str
    provider: Literal["openai", "anthropic", "ollama"]
    model_name: str
    encrypted_api_key: Optional[str] = None   # None for Ollama
    ollama_base_url: Optional[str] = None      # Only for Ollama
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "ai_configs"
        indexes = [
            IndexModel([("tenant_id", 1)], unique=True),
        ]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatSession(Document):
    tenant_id: str
    user_id: str
    title: str = "New Session"
    messages: list[ChatMessage] = Field(default_factory=list)
    blueprint: Optional[dict] = None
    app_id: Optional[str] = None
    status: Literal["active", "blueprint_ready", "materialised", "failed"] = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # TTL: auto-expire sessions after 7 days of inactivity
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7)
    )

    class Settings:
        name = "ai_chat_sessions"
        indexes = [
            IndexModel([("tenant_id", 1), ("user_id", 1)]),
            IndexModel([("expires_at", 1)], expireAfterSeconds=0),
        ]
