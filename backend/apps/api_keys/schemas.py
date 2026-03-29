from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] = ["read"]
    expires_at: Optional[datetime] = None

    @field_validator("scopes")
    @classmethod
    def valid_scopes(cls, v):
        allowed = {"read", "write", "admin"}
        invalid = set(v) - allowed
        if invalid:
            raise ValueError(f"Invalid scopes: {invalid}. Allowed: {allowed}")
        return v

    @field_validator("name")
    @classmethod
    def not_empty(cls, v):
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()


class ApiKeyResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    name: str
    key_prefix: str       # e.g. "ffk_abc12345" — shows first 16 chars
    scopes: list[str]
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    is_active: bool
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Returned only on creation — includes the raw key."""
    raw_key: str


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    scopes: Optional[list[str]] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip() if v is not None else v

    @field_validator("scopes")
    @classmethod
    def valid_scopes(cls, v):
        if v is None:
            return v
        allowed = {"read", "write", "admin"}
        invalid = set(v) - allowed
        if invalid:
            raise ValueError(f"Invalid scopes: {invalid}. Allowed: {allowed}")
        return v
