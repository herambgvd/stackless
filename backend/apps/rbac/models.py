from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class Permission(BaseModel):
    resource: str
    actions: list[str]
    conditions: Optional[dict] = None


class Role(Document):
    name: str
    tenant_id: Optional[str] = None
    app_id: Optional[str] = None
    permissions: list[Permission] = Field(default_factory=list)
    is_system_role: bool = False
    description: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "roles"
        indexes = [
            IndexModel([("tenant_id", 1), ("name", 1)], unique=True),
            IndexModel([("app_id", 1)]),
        ]


class RoleProfile(Document):
    """A named bundle of roles that can be assigned to users as a unit."""
    name: str
    tenant_id: str
    description: str = ""
    roles: list[str] = Field(default_factory=list)   # list of role names
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "role_profiles"
        indexes = [
            IndexModel([("tenant_id", 1), ("name", 1)], unique=True),
        ]
