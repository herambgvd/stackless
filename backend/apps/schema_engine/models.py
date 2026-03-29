from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, List, Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel


class FieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    DATETIME = "datetime"
    SELECT = "select"
    MULTISELECT = "multiselect"
    RELATION = "relation"
    FILE = "file"
    FORMULA = "formula"
    BOOLEAN = "boolean"
    CURRENCY = "currency"
    USER_REF = "user_ref"
    EMAIL = "email"
    URL = "url"
    PHONE = "phone"
    RICH_TEXT = "rich_text"
    JSON = "json"
    ROLLUP = "rollup"
    CHILD_TABLE = "child_table"
    TIME = "time"
    DURATION = "duration"
    COLOR = "color"
    RATING = "rating"
    GEOLOCATION = "geolocation"
    DYNAMIC_LINK = "dynamic_link"
    BARCODE = "barcode"
    SIGNATURE = "signature"
    HTML = "html"
    ATTACH_IMAGE = "attach_image"
    SECTION_BREAK = "section_break"
    COLUMN_BREAK = "column_break"
    PAGE_BREAK = "page_break"
    TABLE_MULTISELECT = "table_multiselect"
    ICON = "icon"


class FieldDefinition(BaseModel):
    name: str
    label: str
    type: FieldType
    config: dict[str, Any] = Field(default_factory=dict)
    order: int = 0
    is_searchable: bool = False
    is_filterable: bool = True
    is_sortable: bool = True
    is_required: bool = False
    default_value: Optional[Any] = None
    perm_level: int = 0  # 0-9; users need role perm_level >= this to see/edit the field
    fetch_from: Optional[str] = None  # "RelatedModel.field_name"
    depends_on: Optional[str] = None  # JS-like expression e.g. "doc.status == 'Active'"
    mandatory_depends_on: Optional[str] = None
    read_only_depends_on: Optional[str] = None
    in_list_view: Optional[bool] = True
    read_only: bool = False          # always read-only (static, not condition-based)
    is_hidden: bool = False          # hides field from the form UI entirely
    columns: Optional[int] = None  # for column break: number of columns
    color: Optional[str] = None  # for color field: default color
    max_rating: Optional[int] = 5  # for rating field
    precision: Optional[int] = None  # decimal precision
    is_single: Optional[bool] = False  # for Single DocType pattern


class NavItem(BaseModel):
    label: str
    model_slug: Optional[str] = None
    icon: Optional[str] = None
    path: Optional[str] = None
    order: int = 0


class AppDefinition(Document):
    name: str
    slug: str
    tenant_id: str
    description: str = ""
    icon: str = "box"
    color: str = "#6366f1"
    nav_items: list[NavItem] = Field(default_factory=list)
    created_by: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "app_definitions"
        indexes = [
            IndexModel([("tenant_id", 1), ("slug", 1)], unique=True),
            IndexModel([("tenant_id", 1)]),
        ]


class ModelIndex(BaseModel):
    fields: list[str]
    unique: bool = False
    sparse: bool = False


class DocStatus(int, Enum):
    DRAFT = 0
    SUBMITTED = 1
    CANCELLED = 2


class UserPermission(BaseModel):
    """Row-level restriction: role can only access records where field_name == user.<based_on_user_field>.

    Example: role="Sales User", field_name="owner", based_on_user_field="id"
    → users with Sales User role see only records they own.

    Supported based_on_user_field values: "id", "email", "tenant_id"
    """
    role: str
    field_name: str                          # field on the record to match
    based_on_user_field: str = "id"          # user attribute to match against ("id", "email", "tenant_id")


class ModelPermission(BaseModel):
    """Per-role permission row — mirrors Frappe DocPerm."""
    role: str
    read: bool = True
    write: bool = False
    create: bool = False
    delete: bool = False
    submit: bool = False   # can submit/cancel (only relevant if is_submittable)
    perm_level: int = 0    # max field perm_level accessible by this role (0 = only level-0 fields)


class ModelDefinition(Document):
    app_id: str
    tenant_id: str
    name: str
    slug: str
    plural_name: str
    icon: str = "table"
    order: int = 0
    is_submittable: bool = False   # enables Submit/Cancel/Amend workflow
    naming_series: Optional[str] = None  # e.g. "INV-.YYYY.-.####" → INV-2024-00001
    permissions: list[ModelPermission] = Field(default_factory=list)  # DocPerm matrix
    user_permissions: list[UserPermission] = Field(default_factory=list)  # row-level filters
    fields: list[FieldDefinition] = Field(default_factory=list)
    indexes: list[ModelIndex] = Field(default_factory=list)
    is_single: Optional[bool] = False  # Single DocType — only one record per app
    is_tree: Optional[bool] = False    # Tree DocType — records have parent/child hierarchy
    parent_field: Optional[str] = None  # field name used as parent reference (default: "parent")
    tags_enabled: Optional[bool] = True
    sharing_enabled: Optional[bool] = True
    workflow_states: Optional[List[dict]] = Field(default_factory=list)  # custom state machine
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "model_definitions"
        indexes = [
            IndexModel([("app_id", 1), ("slug", 1)], unique=True),
            IndexModel([("tenant_id", 1)]),
            IndexModel([("tenant_id", 1), ("is_submittable", 1)]),
        ]


class ViewFilter(BaseModel):
    field: str
    operator: str = "equals"
    value: Optional[Any] = None


class View(Document):
    name: str
    app_id: str
    model_slug: str
    tenant_id: str
    user_id: Optional[str] = None          # None = shared with whole tenant
    type: str = "list"                     # list | kanban | calendar | gallery
    filter_conditions: list[ViewFilter] = Field(default_factory=list)
    sort_field: str = "created_at"
    sort_dir: int = -1
    visible_columns: list[str] = Field(default_factory=list)
    group_by_field: Optional[str] = None   # kanban: status field; calendar: date field
    column_widths: dict[str, int] = Field(default_factory=dict)
    is_default: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "views"
        indexes = [
            IndexModel([("app_id", 1), ("model_slug", 1), ("tenant_id", 1)]),
            IndexModel([("user_id", 1)]),
        ]


class FileVersion(Document):
    """Keeps previous versions of FILE field uploads for a record."""
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    field_name: str
    version: int                    # 1-based; current file is always version N+1
    key: str                        # S3 object key
    filename: str
    content_type: str
    size: int
    uploaded_by: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "file_versions"
        indexes = [
            IndexModel([("tenant_id", 1), ("record_id", 1), ("field_name", 1)]),
        ]
