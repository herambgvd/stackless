from datetime import datetime, timezone
from typing import Optional, List
from beanie import Document
from pydantic import Field

class ServerScript(Document):
    tenant_id: str
    app_id: str
    name: str
    script_type: str  # "before_save", "after_save", "before_delete", "after_delete", "api", "scheduler"
    model_slug: Optional[str] = None  # for before/after_save hooks
    enabled: bool = True
    script: str = ""  # Python code
    api_path: Optional[str] = None  # for type="api": endpoint path
    description: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "server_scripts"
        indexes = [[("tenant_id", 1), ("app_id", 1)]]

class ClientScript(Document):
    tenant_id: str
    app_id: str
    name: str
    script_type: str  # "form_load", "form_change", "form_submit", "list_load"
    model_slug: Optional[str] = None
    enabled: bool = True
    script: str = ""  # JavaScript code (executed in browser)
    description: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "client_scripts"
        indexes = [[("tenant_id", 1), ("app_id", 1)]]
