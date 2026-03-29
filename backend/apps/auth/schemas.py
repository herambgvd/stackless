from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    tenant_id: Optional[str]
    roles: list[str]
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class InviteUserRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    roles: list[str] = Field(default_factory=list)


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    roles: Optional[list[str]] = None
    is_active: Optional[bool] = None


# ── 2FA Schemas ───────────────────────────────────────────────────────────────

class TwoFASetupResponse(BaseModel):
    secret: str
    qr_code_url: str          # otpauth:// URI for QR code generation
    backup_codes: list[str]   # plain-text codes shown ONCE


class TwoFAConfirmRequest(BaseModel):
    totp_code: str = Field(min_length=6, max_length=8)


class TwoFADisableRequest(BaseModel):
    password: str
    totp_code: str = Field(min_length=6, max_length=8)


class TwoFAVerifyRequest(BaseModel):
    temp_token: str
    totp_code: str = Field(min_length=6, max_length=8)


class LoginResponse(BaseModel):
    """Extended login response that may require 2FA step."""
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    requires_2fa: bool = False
    temp_token: Optional[str] = None      # short-lived token for the 2FA verify step


class TwoFAStatusResponse(BaseModel):
    enabled: bool


# ── Password reset schemas ─────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)
