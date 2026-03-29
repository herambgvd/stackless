from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

from apps.api_keys.models import ApiKey


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _generate_raw_key(tenant_id: str) -> str:
    prefix = tenant_id[:8].replace("-", "")
    return f"ffk_{prefix}_{uuid.uuid4().hex}"


async def create_api_key(
    tenant_id: str,
    user_id: str,
    name: str,
    scopes: list[str],
    expires_at: Optional[datetime] = None,
) -> tuple[ApiKey, str]:
    """Returns (ApiKey document, raw_key). Store the raw_key — it won't be shown again."""
    raw_key = _generate_raw_key(tenant_id)
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:16]

    api_key = ApiKey(
        tenant_id=tenant_id,
        user_id=user_id,
        name=name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=scopes,
        expires_at=expires_at,
    )
    await api_key.insert()
    return api_key, raw_key


async def authenticate_api_key(raw_key: str) -> Optional[ApiKey]:
    """Look up an API key by its hash. Returns None if not found, inactive, or expired."""
    if not raw_key.startswith("ffk_"):
        return None
    key_hash = _hash_key(raw_key)
    api_key = await ApiKey.find_one(ApiKey.key_hash == key_hash)
    if api_key is None or not api_key.is_active:
        return None
    if api_key.expires_at and api_key.expires_at < datetime.now(tz=timezone.utc):
        return None
    # Update last_used_at (fire-and-forget style)
    api_key.last_used_at = datetime.now(tz=timezone.utc)
    await api_key.save()
    return api_key
