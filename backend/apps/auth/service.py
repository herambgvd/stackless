from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone

from apps.auth.models import User
from apps.auth.repository import (
    create_user,
    get_user_by_email,
    get_valid_refresh_token,
    revoke_refresh_token,
    save_refresh_token,
)
from apps.auth.schemas import RegisterRequest, TokenResponse
from core.config import get_settings
from core.exceptions import ConflictError, UnauthorizedError
from core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_refresh_token,
)

settings = get_settings()


def _build_token_response(user: User) -> TokenResponse:
    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "tenant_id": user.tenant_id,
        "roles": user.roles,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def authenticate_user_with_2fa(email: str, password: str):
    """
    Authenticate and handle 2FA challenge.
    Returns (user, tokens, requires_2fa, temp_token).
    If 2FA is enabled, tokens is None and temp_token is the challenge token.
    """
    user = await get_user_by_email(email)
    if user is None or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password.")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated.")

    if user.totp_enabled and user.totp_secret:
        from core.security import create_temp_2fa_token
        temp_token = create_temp_2fa_token(str(user.id))
        return user, None, True, temp_token

    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(
        user_id=str(user.id),
        token=tokens.refresh_token,
        expires_at=expires_at,
    )
    return user, tokens, False, None


async def authenticate_user(email: str, password: str) -> tuple[User, TokenResponse]:
    user = await get_user_by_email(email)
    if user is None or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password.")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated.")

    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(
        user_id=str(user.id),
        token=tokens.refresh_token,
        expires_at=expires_at,
    )
    return user, tokens


def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    slug = slug.strip("-")
    return slug[:40] or "workspace"


async def register_user(payload: RegisterRequest) -> tuple[User, TokenResponse]:
    existing = await get_user_by_email(payload.email)
    if existing:
        raise ConflictError("A user with this email already exists.")

    user = await create_user(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        tenant_id=None,
    )

    # Auto-create a personal workspace tenant for every new registration
    from apps.tenants.schemas import TenantCreate
    from apps.tenants.service import create_new_tenant

    base_slug = _slugify(payload.full_name) or payload.email.split("@")[0]
    slug = f"{base_slug}-{secrets.token_hex(3)}"

    await create_new_tenant(
        TenantCreate(name=f"{payload.full_name}'s Workspace", slug=slug),
        owner_id=str(user.id),
    )
    # Reload user so token carries the new tenant_id
    from apps.auth.repository import get_user_by_id
    user = await get_user_by_id(str(user.id))

    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(
        user_id=str(user.id),
        token=tokens.refresh_token,
        expires_at=expires_at,
    )
    return user, tokens


async def refresh_access_token(refresh_token: str) -> TokenResponse:
    payload = verify_refresh_token(refresh_token)
    if payload is None:
        raise UnauthorizedError("Invalid refresh token.")

    db_token = await get_valid_refresh_token(refresh_token)
    if db_token is None:
        raise UnauthorizedError("Refresh token expired or revoked.")

    from apps.auth.repository import get_user_by_id

    user = await get_user_by_id(payload["sub"])
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive.")

    # Rotate refresh token
    await revoke_refresh_token(refresh_token)
    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(
        user_id=str(user.id),
        token=tokens.refresh_token,
        expires_at=expires_at,
    )
    return tokens


async def logout_user(refresh_token: str) -> None:
    await revoke_refresh_token(refresh_token)
