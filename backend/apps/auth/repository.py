from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.auth.models import RefreshToken, User
from core.security import hash_token


async def get_user_by_email(email: str) -> Optional[User]:
    return await User.find_one(User.email == email)


async def get_user_by_id(user_id: str) -> Optional[User]:
    try:
        oid = PydanticObjectId(user_id)
    except Exception:
        return None
    return await User.get(oid)


async def list_users_by_tenant(tenant_id: str) -> list[User]:
    return await User.find(User.tenant_id == tenant_id).to_list()


async def create_user(
    *,
    email: str,
    hashed_password: str,
    full_name: str,
    tenant_id: Optional[str] = None,
    roles: list[str] | None = None,
    is_superuser: bool = False,
) -> User:
    user = User(
        email=email,
        hashed_password=hashed_password,
        full_name=full_name,
        tenant_id=tenant_id,
        roles=roles or [],
        is_superuser=is_superuser,
    )
    await user.insert()
    return user


async def update_user(user: User, **kwargs) -> User:
    for key, value in kwargs.items():
        if hasattr(user, key):
            setattr(user, key, value)
    user.updated_at = datetime.now(tz=timezone.utc)
    await user.save()
    return user


async def save_refresh_token(
    *,
    user_id: str,
    token: str,
    expires_at: datetime,
) -> RefreshToken:
    rt = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(token),
        expires_at=expires_at,
    )
    await rt.insert()
    return rt


async def revoke_refresh_token(token: str) -> bool:
    token_hash = hash_token(token)
    rt = await RefreshToken.find_one(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked == False,
    )
    if rt is None:
        return False
    rt.revoked = True
    await rt.save()
    return True


async def get_valid_refresh_token(token: str) -> Optional[RefreshToken]:
    token_hash = hash_token(token)
    return await RefreshToken.find_one(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked == False,
        RefreshToken.expires_at > datetime.now(tz=timezone.utc),
    )
