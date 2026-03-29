from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from apps.schema_engine.models import FieldType, ModelPermission, UserPermission


class FieldCreate(BaseModel):
    name: str = Field(pattern=r"^[a-z_][a-z0-9_]*$")
    label: str
    type: FieldType
    config: dict[str, Any] = Field(default_factory=dict)
    order: int = 0
    is_searchable: bool = False
    is_filterable: bool = True
    is_sortable: bool = True
    is_required: bool = False
    default_value: Optional[Any] = None
    perm_level: int = 0


class FieldUpdate(BaseModel):
    label: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    order: Optional[int] = None
    is_searchable: Optional[bool] = None
    is_filterable: Optional[bool] = None
    is_sortable: Optional[bool] = None
    is_required: Optional[bool] = None
    default_value: Optional[Any] = None


class FieldResponse(BaseModel):
    name: str
    label: str
    type: FieldType
    config: dict[str, Any]
    order: int
    is_searchable: bool
    is_filterable: bool
    is_sortable: bool
    is_required: bool
    default_value: Optional[Any]
    perm_level: int = 0


class AppCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: Optional[str] = Field(None, min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")
    description: str = ""
    icon: str = "box"
    color: str = "#6366f1"


class AppUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class AppResponse(BaseModel):
    id: str
    name: str
    slug: str
    tenant_id: str
    description: str
    icon: str
    color: str
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: Optional[str] = Field(None, min_length=2, max_length=50, pattern=r"^[a-z_][a-z0-9_]*$")
    plural_name: Optional[str] = None
    icon: str = "table"
    order: int = 0
    is_submittable: bool = False
    is_tree: bool = False
    parent_field: Optional[str] = None
    naming_series: Optional[str] = None
    fields: list[FieldCreate] = Field(default_factory=list)


class WorkflowTransition(BaseModel):
    to: str        # target state name
    label: str     # button label, e.g. "Submit for Review"
    allowed_roles: list[str] = Field(default_factory=list)  # empty = any role


class WorkflowState(BaseModel):
    name: str            # unique key, e.g. "draft"
    label: str           # display label, e.g. "Draft"
    color: str = "#64748b"   # hex color for badge
    is_initial: bool = False # one state should be initial
    transitions: list[WorkflowTransition] = Field(default_factory=list)


class ModelUpdate(BaseModel):
    name: Optional[str] = None
    plural_name: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = None
    is_submittable: Optional[bool] = None
    is_tree: Optional[bool] = None
    parent_field: Optional[str] = None
    naming_series: Optional[str] = None
    fields: Optional[list[FieldCreate]] = None
    permissions: Optional[list[ModelPermission]] = None
    user_permissions: Optional[list[UserPermission]] = None
    workflow_states: Optional[list[WorkflowState]] = None


class ModelResponse(BaseModel):
    id: str
    app_id: str
    tenant_id: str
    name: str
    slug: str
    plural_name: str
    icon: str
    order: int
    is_submittable: bool = False
    is_single: bool = False
    is_tree: bool = False
    parent_field: Optional[str] = None
    naming_series: Optional[str] = None
    permissions: list[ModelPermission] = Field(default_factory=list)
    user_permissions: list[UserPermission] = Field(default_factory=list)
    workflow_states: list[WorkflowState] = Field(default_factory=list)
    fields: list[FieldResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DynamicRecordCreate(BaseModel):
    data: dict[str, Any]


class DynamicRecordUpdate(BaseModel):
    data: dict[str, Any]


class BulkRecordUpdate(BaseModel):
    record_ids: list[str] = Field(min_length=1)
    data: dict[str, Any]


class PaginatedRecordsResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    has_more: bool


class ViewFilterSchema(BaseModel):
    field: str
    operator: str = "equals"
    value: Optional[Any] = None

class ViewCreate(BaseModel):
    name: str
    type: str = "list"
    filter_conditions: list[ViewFilterSchema] = []
    sort_field: str = "created_at"
    sort_dir: int = -1
    visible_columns: list[str] = []
    group_by_field: Optional[str] = None
    column_widths: dict[str, int] = {}
    is_default: bool = False

class ViewUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    filter_conditions: Optional[list[ViewFilterSchema]] = None
    sort_field: Optional[str] = None
    sort_dir: Optional[int] = None
    visible_columns: Optional[list[str]] = None
    group_by_field: Optional[str] = None
    column_widths: Optional[dict[str, int]] = None
    is_default: Optional[bool] = None

class ViewResponse(BaseModel):
    id: str
    name: str
    app_id: str
    model_slug: str
    tenant_id: str
    user_id: Optional[str]
    type: str
    filter_conditions: list[ViewFilterSchema]
    sort_field: str
    sort_dir: int
    visible_columns: list[str]
    group_by_field: Optional[str]
    column_widths: dict[str, int]
    is_default: bool
    created_at: datetime
    updated_at: datetime
