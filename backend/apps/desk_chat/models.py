from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class ChatChannel(Document):
    """A named chat channel (team room or DM thread)."""
    tenant_id: str
    name: str                       # e.g. "general", "support"
    description: Optional[str] = None
    channel_type: str = "public"    # public | private | dm
    member_ids: list[str] = Field(default_factory=list)  # for dm/private
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "chat_channels"
        indexes = [
            IndexModel([("tenant_id", 1)]),
            IndexModel([("tenant_id", 1), ("name", 1)], unique=True),
        ]


class ChatMessage(Document):
    """A message posted in a chat channel."""
    tenant_id: str
    channel_id: str
    user_id: str
    user_name: str
    body: str
    attachments: list[dict] = Field(default_factory=list)
    reply_to_id: Optional[str] = None    # threaded reply
    reactions: dict = Field(default_factory=dict)   # emoji -> list[user_id]
    edited: bool = False
    deleted: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "chat_messages"
        indexes = [
            IndexModel([("channel_id", 1), ("created_at", -1)]),
            IndexModel([("tenant_id", 1)]),
        ]
