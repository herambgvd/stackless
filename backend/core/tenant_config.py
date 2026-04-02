"""Tenant configuration resolver.

Provides helpers that check tenant-level config first,
falling back to platform .env defaults when a tenant override is not set.
"""
from __future__ import annotations

from typing import Any, Optional

from core.config import get_settings

_settings = get_settings()

# Cache tenant configs to avoid repeated DB lookups within a request
_tenant_config_cache: dict[str, Any] = {}


async def get_tenant_config(tenant_id: str):
    """Fetch the TenantConfig for a given tenant_id. Returns None if not found."""
    if not tenant_id:
        return None

    if tenant_id in _tenant_config_cache:
        return _tenant_config_cache[tenant_id]

    from apps.tenants.repository import get_tenant_by_id
    tenant = await get_tenant_by_id(tenant_id)
    if tenant is None:
        return None

    _tenant_config_cache[tenant_id] = tenant.config
    return tenant.config


def invalidate_tenant_config_cache(tenant_id: str) -> None:
    """Call after updating a tenant's config to clear the cache."""
    _tenant_config_cache.pop(tenant_id, None)


async def resolve_smtp_config(tenant_id: str) -> dict:
    """Resolve SMTP settings: tenant override → .env defaults."""
    config = await get_tenant_config(tenant_id)

    # Check tenant email_config first (existing field), then config.smtp
    from apps.tenants.repository import get_tenant_by_id
    tenant = await get_tenant_by_id(tenant_id) if tenant_id else None

    if tenant and tenant.email_config and tenant.email_config.is_configured:
        ec = tenant.email_config
        return {
            "host": ec.smtp_host or _settings.SMTP_HOST,
            "port": ec.smtp_port or _settings.SMTP_PORT,
            "username": ec.smtp_username or _settings.SMTP_USERNAME,
            "password": ec.smtp_password or _settings.SMTP_PASSWORD,
            "use_tls": ec.use_tls if ec.use_tls is not None else _settings.SMTP_USE_TLS,
            "email_from": ec.email_from or _settings.EMAIL_FROM,
        }

    return {
        "host": _settings.SMTP_HOST,
        "port": _settings.SMTP_PORT,
        "username": _settings.SMTP_USERNAME,
        "password": _settings.SMTP_PASSWORD,
        "use_tls": _settings.SMTP_USE_TLS,
        "email_from": _settings.EMAIL_FROM,
    }


async def resolve_storage_config(tenant_id: str) -> dict:
    """Resolve object storage settings: tenant override → .env defaults."""
    config = await get_tenant_config(tenant_id)
    sc = config.storage if config else None

    return {
        "endpoint": (sc.endpoint if sc and sc.endpoint else _settings.RUSTFS_ENDPOINT),
        "access_key": (sc.access_key if sc and sc.access_key else _settings.RUSTFS_ACCESS_KEY),
        "secret_key": (sc.secret_key if sc and sc.secret_key else _settings.RUSTFS_SECRET_KEY),
        "bucket_name": (sc.bucket_name if sc and sc.bucket_name else _settings.RUSTFS_BUCKET_NAME),
        "use_ssl": (sc.use_ssl if sc and sc.use_ssl is not None else _settings.RUSTFS_USE_SSL),
    }


async def resolve_security_config(tenant_id: str) -> dict:
    """Resolve security settings: tenant override → .env defaults."""
    config = await get_tenant_config(tenant_id)
    sec = config.security if config else None

    return {
        "rate_limit_requests": (sec.rate_limit_requests if sec and sec.rate_limit_requests else _settings.RATE_LIMIT_REQUESTS),
        "rate_limit_window_seconds": (sec.rate_limit_window_seconds if sec and sec.rate_limit_window_seconds else _settings.RATE_LIMIT_WINDOW_SECONDS),
        "max_upload_size_mb": (sec.max_upload_size_mb if sec and sec.max_upload_size_mb else _settings.MAX_UPLOAD_SIZE_MB),
    }


async def resolve_oauth_config(tenant_id: str) -> dict:
    """Resolve OAuth settings: tenant override → .env defaults."""
    config = await get_tenant_config(tenant_id)
    oa = config.oauth if config else None

    return {
        "google_client_id": (oa.google_client_id if oa and oa.google_client_id else _settings.GOOGLE_CLIENT_ID),
        "google_client_secret": (oa.google_client_secret if oa and oa.google_client_secret else _settings.GOOGLE_CLIENT_SECRET),
        "github_client_id": (oa.github_client_id if oa and oa.github_client_id else _settings.GITHUB_CLIENT_ID),
        "github_client_secret": (oa.github_client_secret if oa and oa.github_client_secret else _settings.GITHUB_CLIENT_SECRET),
    }
