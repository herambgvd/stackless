from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PermissionSchema(BaseModel):
    resource: str
    actions: list[str]
    conditions: Optional[dict] = None


class RoleCreate(BaseModel):
    name: str
    tenant_id: Optional[str] = None
    app_id: Optional[str] = None
    permissions: list[PermissionSchema] = []
    description: str = ""


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[list[PermissionSchema]] = None
    description: Optional[str] = None


class RoleResponse(BaseModel):
    id: str
    name: str
    tenant_id: Optional[str]
    app_id: Optional[str]
    permissions: list[PermissionSchema]
    is_system_role: bool
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssignRoleRequest(BaseModel):
    user_id: str
    role_name: str


class RevokeRoleRequest(BaseModel):
    user_id: str
    role_name: str


class UserPermissionsResponse(BaseModel):
    user_id: str
    roles: list[str]
    permissions: list[PermissionSchema]
