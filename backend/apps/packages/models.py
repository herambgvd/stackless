from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class PackageLimits(BaseModel):
    max_apps: int = 3
    max_records: int = 500
    max_workflows: int = 1
    max_users: int = 2
    storage_mb: int = 100
    ai_builder: bool = False
    allow_custom_domain: bool = False
    allow_white_label: bool = False
    allow_api_access: bool = False
    allow_webhooks: bool = False
    allow_advanced_reports: bool = False
    allow_sso: bool = False
    support_level: str = "community"  # community | email | priority | dedicated


class Package(Document):
    name: str
    slug: str  # unique identifier — e.g. "free", "starter"
    is_active: bool = True
    price_monthly: float = 0.0
    price_yearly: float = 0.0
    limits: PackageLimits = Field(default_factory=PackageLimits)
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "packages"
        indexes = [
            IndexModel([("slug", 1)], unique=True),
            IndexModel([("sort_order", 1)]),
        ]
