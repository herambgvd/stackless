from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from core.config import get_settings


def _get_fernet() -> Fernet:
    """Derive a Fernet key from the app SECRET_KEY via SHA-256."""
    settings = get_settings()
    raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_api_key(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_api_key(cipher: str) -> str:
    return _get_fernet().decrypt(cipher.encode()).decode()
