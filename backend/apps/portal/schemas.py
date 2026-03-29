from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class PortalSchemaField(BaseModel):
    id: str
    key: str
    label: str
    type: str
    required: bool = False
    placeholder: Optional[str] = None
    description: Optional[str] = None
    options: Optional[list[str]] = None
    # For relation fields
    related_model_slug: Optional[str] = None
    allow_multiple: Optional[bool] = None


class PortalModelSchema(BaseModel):
    """Schema for a single model exposed via the portal."""
    model_id: str
    slug: str
    name: str
    plural_name: str
    fields: list[PortalSchemaField] = []


class PortalAppSchema(BaseModel):
    """Full portal schema for an app — contains all models."""
    app_id: str
    app_name: str
    description: str = ""
    models: list[PortalModelSchema] = []


# Keep single-model response for backward compat
class PortalSchemaResponse(BaseModel):
    app_id: str
    name: str
    description: str = ""
    fields: list[PortalSchemaField] = []


class PortalSubmitRequest(BaseModel):
    data: dict[str, Any]
    model_slug: Optional[str] = None   # which model to submit to; defaults to first model


class PortalSubmissionResponse(BaseModel):
    id: str
    app_id: str
    model_slug: Optional[str] = None
    record_id: Optional[str] = None    # ID of the created dynamic record
    tenant_id: str
    data: dict[str, Any]
    status: str = "submitted"
    created_at: datetime
