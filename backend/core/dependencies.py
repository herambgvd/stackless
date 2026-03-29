from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.exceptions import ForbiddenError, UnauthorizedError
from core.security import verify_access_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class ApiKeyUser:
    """Minimal user-like object synthesised from a valid API key.

    Provides the same interface as the ``User`` Beanie document for the
    fields accessed by dependencies and route handlers.
    """

    id: str
    tenant_id: str
    is_active: bool = True
    is_superuser: bool = False
    roles: list[str] = field(default_factory=list)
    full_name: str = "API Key"
    email: str = ""
    scopes: list[str] = field(default_factory=lambda: ["read"])


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    """Extract and validate JWT or API key; return the User document (or ApiKeyUser)."""
    from apps.auth.repository import get_user_by_id

    token: str | None = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    else:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise UnauthorizedError("No authentication token provided.")

    # ── API key path ──────────────────────────────────────────────────────────
    if token.startswith("ffk_"):
        from apps.api_keys.service import authenticate_api_key

        api_key = await authenticate_api_key(token)
        if api_key is None:
            raise UnauthorizedError("Invalid or expired API key.")
        return ApiKeyUser(
            id=api_key.user_id,
            tenant_id=api_key.tenant_id,
            scopes=api_key.scopes,
        )

    # ── JWT path ──────────────────────────────────────────────────────────────
    payload = verify_access_token(token)
    if payload is None:
        raise UnauthorizedError("Invalid or expired token.")

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Token payload missing subject.")

    user = await get_user_by_id(user_id)
    if user is None:
        raise UnauthorizedError("User not found.")

    return user


async def get_current_active_user(current_user=Depends(get_current_user)):
    if not current_user.is_active:
        raise ForbiddenError("Your account has been deactivated.")
    return current_user


async def require_superuser(current_user=Depends(get_current_active_user)):
    """Only allow users with is_superuser=True (platform Super Admin)."""
    if not current_user.is_superuser:
        raise ForbiddenError("This action requires Super Admin privileges.")
    return current_user


def require_role(roles: list[str]) -> Callable:
    """Dependency factory that enforces at least one of the given roles."""

    async def _check(current_user=Depends(get_current_active_user)):
        if current_user.is_superuser:
            return current_user
        user_roles = set(current_user.roles or [])
        if not user_roles.intersection(roles):
            raise ForbiddenError(
                f"Required role(s): {', '.join(roles)}. You have: {', '.join(user_roles) or 'none'}."
            )
        return current_user

    return _check


_SCOPE_ACTION_MAP = {
    "read": {"read"},
    "write": {"create", "update", "read"},
    "delete": {"create", "update", "delete", "read"},
    "admin": {"create", "update", "delete", "read", "admin"},
}


def require_permission(resource: str, action: str) -> Callable:
    """Dependency factory that checks RBAC permissions.

    Resolves the user's roles and verifies that at least one has
    a Permission with matching resource and action.  Superusers bypass
    the check entirely.  API-key users are checked against their scopes.
    """

    async def _check(
        current_user=Depends(get_current_active_user),
        tenant_id: str = Depends(get_tenant_id),
    ):
        if current_user.is_superuser:
            return current_user

        # API key scope check — scopes grant coarse-grained access
        if isinstance(current_user, ApiKeyUser):
            allowed_actions: set[str] = set()
            for scope in current_user.scopes:
                allowed_actions |= _SCOPE_ACTION_MAP.get(scope, set())
            if action in allowed_actions:
                return current_user
            raise ForbiddenError(f"API key scope does not allow: {action} on {resource}.")

        user_role_names: list[str] = current_user.roles or []
        if not user_role_names:
            raise ForbiddenError(f"Permission denied: {action} on {resource}.")

        from apps.rbac.models import Role

        # Fetch all roles for this tenant that match the user's role names
        roles = await Role.find(
            Role.tenant_id == tenant_id,
            {"name": {"$in": user_role_names}},
        ).to_list()

        for role in roles:
            for perm in role.permissions:
                if perm.resource == resource and action in perm.actions:
                    return current_user

        raise ForbiddenError(f"Permission denied: {action} on {resource}.")

    return _check


async def get_tenant_id(
    request: Request,
    current_user=Depends(get_current_active_user),
) -> str:
    """Return the tenant_id from the authenticated user or X-Tenant-ID header.

    If the user has no tenant yet (e.g. created before auto-provisioning), a
    personal workspace is created on-the-fly so the request succeeds.
    """
    # Always trust the tenant embedded in the authenticated user's credential first.
    # This prevents a user from supplying an X-Tenant-ID header that belongs to a
    # different tenant (cross-tenant IDOR).
    if current_user.tenant_id:
        return str(current_user.tenant_id)

    # Fall back to the tenant set on request state by the middleware (JWT claim or header).
    # This path is only reached when the credential carries no tenant (e.g. freshly-
    # registered users before workspace provisioning).
    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id:
        return tenant_id

    # Auto-provision a workspace for legacy users who have none
    import re
    import secrets as _secrets

    from apps.tenants.schemas import TenantCreate
    from apps.tenants.service import create_new_tenant

    base = re.sub(r"[^a-z0-9\s-]", "", current_user.full_name.lower().strip())
    base = re.sub(r"\s+", "-", base).strip("-") or "workspace"
    slug = f"{base[:40]}-{_secrets.token_hex(3)}"

    tenant = await create_new_tenant(
        TenantCreate(name=f"{current_user.full_name}'s Workspace", slug=slug),
        owner_id=str(current_user.id),
    )
    return str(tenant.id)
