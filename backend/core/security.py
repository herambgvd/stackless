from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from core.config import get_settings

settings = get_settings()


# ── Key derivation ───────────────────────────────────────────────────────────
# Each token type gets its own signing key derived from SECRET_KEY via HMAC.
# This way, leaking one token type doesn't compromise others.

def _derive_key(purpose: str) -> str:
    """Derive a per-purpose signing key from the master SECRET_KEY."""
    return hmac.new(
        settings.SECRET_KEY.encode(),
        purpose.encode(),
        hashlib.sha256,
    ).hexdigest()


_KEY_ACCESS = _derive_key("access")
_KEY_REFRESH = _derive_key("refresh")
_KEY_2FA = _derive_key("2fa_challenge")
_KEY_PASSWORD_RESET = _derive_key("password_reset")


# ── Password helpers ──────────────────────────────────────────────────────────
# Uses bcrypt directly — passlib is unmaintained and broken on bcrypt>=4 / Python 3.14.

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Token creation ─────────────────────────────────────────────────────────────

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(tz=timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, _KEY_ACCESS, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.now(tz=timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, _KEY_REFRESH, algorithm=settings.ALGORITHM)


# ── Token verification ────────────────────────────────────────────────────────

def verify_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, _KEY_ACCESS, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def verify_refresh_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, _KEY_REFRESH, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


# ── Refresh token hash (stored in DB) ─────────────────────────────────────────

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(64)


def create_temp_2fa_token(user_id: str) -> str:
    """Short-lived token (5 min) used as a 2FA challenge before full login."""
    data = {"sub": user_id, "type": "2fa_challenge"}
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
    data["exp"] = expire
    return jwt.encode(data, _KEY_2FA, algorithm=settings.ALGORITHM)


def verify_temp_2fa_token(token: str) -> str | None:
    """Returns user_id if the token is a valid 2FA challenge token, else None."""
    try:
        payload = jwt.decode(token, _KEY_2FA, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "2fa_challenge":
            return None
        return payload.get("sub")
    except JWTError:
        return None


# ── CSRF tokens ───────────────────────────────────────────────────────────────

def generate_csrf_token(user_id: str) -> str:
    """Generate a short-lived CSRF token tied to a user."""
    data = {"sub": user_id, "type": "csrf"}
    expire = datetime.now(tz=timezone.utc) + timedelta(seconds=settings.CSRF_TOKEN_TTL_SECONDS)
    data["exp"] = expire
    return jwt.encode(data, settings.CSRF_SECRET, algorithm=settings.ALGORITHM)


def verify_csrf_token(token: str, expected_user_id: str) -> bool:
    """Validate a CSRF token and confirm it belongs to the expected user."""
    try:
        payload = jwt.decode(token, settings.CSRF_SECRET, algorithms=[settings.ALGORITHM])
        return payload.get("type") == "csrf" and payload.get("sub") == expected_user_id
    except JWTError:
        return False


# ── Password reset tokens ──────────────────────────────────────────────────────

def generate_password_reset_token(user_id: str) -> str:
    """Generate a 1-hour password-reset JWT."""
    data = {"sub": user_id, "type": "password_reset"}
    expire = datetime.now(tz=timezone.utc) + timedelta(hours=1)
    data["exp"] = expire
    return jwt.encode(data, _KEY_PASSWORD_RESET, algorithm=settings.ALGORITHM)


def verify_password_reset_token(token: str) -> str | None:
    """Returns user_id if the token is a valid, unexpired password-reset token."""
    try:
        payload = jwt.decode(token, _KEY_PASSWORD_RESET, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "password_reset":
            return None
        return payload.get("sub")
    except JWTError:
        return None
