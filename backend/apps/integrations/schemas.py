from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel
from apps.integrations.models import IntegrationProvider, CredentialType


class IntegrationCreate(BaseModel):
    name: str
    provider: IntegrationProvider
    credential_type: CredentialType
    credentials: dict[str, Any] = {}


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    credentials: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class IntegrationResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    provider: str
    credential_type: str
    is_active: bool
    last_used_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    # NOTE: credentials are NEVER returned to the client
