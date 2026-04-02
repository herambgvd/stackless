from __future__ import annotations

import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, status

from apps.auth.schemas import (
    AdminUserUpdate,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    InviteUserRequest,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TwoFAConfirmRequest,
    TwoFADisableRequest,
    TwoFASetupResponse,
    TwoFAStatusResponse,
    TwoFAVerifyRequest,
    UserResponse,
    UserUpdate,
)
from apps.auth.service import (
    authenticate_user,
    authenticate_user_with_2fa,
    logout_user,
    refresh_access_token,
    register_user,
)
from apps.auth.repository import create_user, get_user_by_email, get_user_by_id, list_users_by_tenant, update_user
from core.dependencies import get_current_active_user, get_tenant_id, require_role
from core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from core.security import hash_password, verify_password

router = APIRouter()

# ── Simple in-process rate limiter for password reset ─────────────────────────
_reset_attempts: dict[str, list[float]] = defaultdict(list)


def _check_password_reset_rate_limit(email: str) -> None:
    """Allow at most 5 reset requests per email per hour."""
    now = time.time()
    window = 3600.0
    max_attempts = 5
    recent = [t for t in _reset_attempts[email] if now - t < window]
    _reset_attempts[email] = recent
    if len(recent) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset attempts. Please wait before trying again.",
        )
    _reset_attempts[email].append(now)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    """Register a new user account."""
    _, tokens = await register_user(payload)
    return tokens


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    """Authenticate with email and password. If 2FA is enabled, returns a challenge."""
    _, tokens, requires_2fa, temp_token = await authenticate_user_with_2fa(
        payload.email, payload.password
    )
    if requires_2fa:
        return LoginResponse(requires_2fa=True, temp_token=temp_token)
    return LoginResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        requires_2fa=False,
    )


@router.post("/2fa/verify", response_model=TokenResponse)
async def verify_2fa(payload: TwoFAVerifyRequest):
    """Complete 2FA login: verify TOTP code against the challenge temp_token."""
    from core.security import verify_temp_2fa_token
    from apps.auth.repository import get_user_by_id
    from datetime import timedelta
    import pyotp

    user_id = verify_temp_2fa_token(payload.temp_token)
    if not user_id:
        raise UnauthorizedError("Invalid or expired 2FA challenge token.")

    user = await get_user_by_id(user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive.")

    if not user.totp_enabled or not user.totp_secret:
        raise UnauthorizedError("2FA is not enabled for this user.")

    totp = pyotp.TOTP(user.totp_secret)
    # Allow backup codes too
    code = payload.totp_code.replace(" ", "").replace("-", "")
    code_valid = totp.verify(code, valid_window=1)

    if not code_valid:
        # Check backup codes
        from core.security import hash_token
        hashed = hash_token(code)
        if hashed in user.totp_backup_codes:
            user.totp_backup_codes.remove(hashed)
            await update_user(user)
        else:
            raise UnauthorizedError("Invalid 2FA code.")

    from apps.auth.service import _build_token_response, save_refresh_token
    from core.config import get_settings as _get_settings
    _settings = _get_settings()
    from datetime import datetime, timezone
    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=_settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(user_id=str(user.id), token=tokens.refresh_token, expires_at=expires_at)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    return await refresh_access_token(payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest):
    """Revoke the provided refresh token."""
    await logout_user(payload.refresh_token)


@router.get("/csrf-token")
async def get_csrf_token(current_user=Depends(get_current_active_user)):
    """Return a short-lived CSRF token for the current user.
    Frontend should fetch this once on login and attach it as X-CSRF-Token on all mutating requests."""
    from core.security import generate_csrf_token
    return {"csrf_token": generate_csrf_token(str(current_user.id))}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_active_user)):
    """Return the currently authenticated user."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        tenant_id=current_user.tenant_id,
        roles=current_user.roles,
        is_active=current_user.is_active,
        is_superuser=current_user.is_superuser,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )


@router.get("/me/2fa/status", response_model=TwoFAStatusResponse)
async def get_2fa_status(current_user=Depends(get_current_active_user)):
    """Return whether 2FA is currently enabled for the authenticated user."""
    return TwoFAStatusResponse(enabled=current_user.totp_enabled)


@router.post("/me/2fa/setup", response_model=TwoFASetupResponse)
async def setup_2fa(current_user=Depends(get_current_active_user)):
    """
    Generate a new TOTP secret + backup codes for the user.
    Returns a base64-encoded QR code PNG that the frontend can display directly.
    """
    import base64
    import io
    import secrets as _secrets

    import pyotp
    import qrcode

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    qr_uri = totp.provisioning_uri(name=current_user.email, issuer_name="Stackless")

    # Generate QR code as base64 PNG
    img = qrcode.make(qr_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    # Generate 10 backup codes
    plain_codes = [_secrets.token_hex(4).upper() for _ in range(10)]
    from core.security import hash_token
    hashed_codes = [hash_token(c) for c in plain_codes]

    await update_user(
        current_user,
        totp_secret=secret,
        totp_backup_codes=hashed_codes,
        totp_enabled=False,
    )

    return TwoFASetupResponse(
        secret=secret,
        qr_code_url=qr_b64,
        backup_codes=plain_codes,
    )


# ── Password reset ─────────────────────────────────────────────────────────────

@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(payload: ForgotPasswordRequest):
    """Request a password reset email. Always returns 204 to avoid user enumeration."""
    from core.security import generate_password_reset_token
    from apps.notifications.tasks import send_notification_task

    _check_password_reset_rate_limit(payload.email)

    user = await get_user_by_email(payload.email)
    if not user or not user.is_active:
        return  # silent success

    from core.config import get_settings as _get_settings
    _settings = _get_settings()
    token = generate_password_reset_token(str(user.id))
    reset_link = f"{_settings.APP_BASE_URL}/reset-password?token={token}"

    try:
        from apps.notifications.repository import get_template_by_slug
        _tmpl = await get_template_by_slug("password-reset", user.tenant_id or "")
        send_notification_task.delay(
            channel="email",
            recipient=payload.email,
            template_id=str(_tmpl.id) if _tmpl else None,
            context={"full_name": user.full_name, "reset_link": reset_link},
            tenant_id=user.tenant_id or "",
            subject=_tmpl.subject_template if _tmpl else "Reset your Stackless password",
            body=None if _tmpl else (
                f"Hello {user.full_name},\n\n"
                f"Click the link below to reset your password (expires in 1 hour):\n\n"
                f"{reset_link}\n\n"
                f"If you did not request a password reset, ignore this email."
            ),
        )
    except Exception:
        pass  # Best-effort — don't expose SMTP errors


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(payload: ResetPasswordRequest):
    """Apply a new password using a valid reset token."""
    from core.security import verify_password_reset_token

    user_id = verify_password_reset_token(payload.token)
    if not user_id:
        raise UnauthorizedError("Invalid or expired password reset token.")

    user = await get_user_by_id(user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("Invalid or expired password reset token.")

    await update_user(user, hashed_password=hash_password(payload.new_password))

    # Invalidate all refresh tokens — forces re-login on all devices
    from apps.auth.models import RefreshToken
    await RefreshToken.find(RefreshToken.user_id == user_id).delete()


@router.post("/me/2fa/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_2fa(
    payload: TwoFAConfirmRequest,
    current_user=Depends(get_current_active_user),
):
    """Activate 2FA by verifying the first TOTP code from the authenticator app."""
    import pyotp
    if not current_user.totp_secret:
        raise UnauthorizedError("Call /me/2fa/setup first.")
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(payload.totp_code, valid_window=1):
        raise UnauthorizedError("Invalid TOTP code.")
    await update_user(current_user, totp_enabled=True)


@router.post("/me/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_2fa(
    payload: TwoFADisableRequest,
    current_user=Depends(get_current_active_user),
):
    """Disable 2FA. Requires current password + a valid TOTP code."""
    if not verify_password(payload.password, current_user.hashed_password):
        raise UnauthorizedError("Incorrect password.")
    if not current_user.totp_enabled or not current_user.totp_secret:
        return
    import pyotp
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(payload.totp_code, valid_window=1):
        raise UnauthorizedError("Invalid TOTP code.")
    await update_user(
        current_user,
        totp_enabled=False,
        totp_secret=None,
        totp_backup_codes=[],
    )


@router.put("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdate,
    current_user=Depends(get_current_active_user),
):
    """Update the current user's profile."""
    kwargs = payload.model_dump(exclude_none=True)
    updated = await update_user(current_user, **kwargs)
    return UserResponse(
        id=str(updated.id),
        email=updated.email,
        full_name=updated.full_name,
        tenant_id=updated.tenant_id,
        roles=updated.roles,
        is_active=updated.is_active,
        is_superuser=updated.is_superuser,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
    )


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    current_user=Depends(get_current_active_user),
):
    """Change the current user's password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise UnauthorizedError("Current password is incorrect.")
    await update_user(current_user, hashed_password=hash_password(payload.new_password))


# ── User Management (admin) ──────────────────────────────────────────────────


def _user_response(u) -> UserResponse:
    return UserResponse(
        id=str(u.id),
        email=u.email,
        full_name=u.full_name,
        tenant_id=u.tenant_id,
        roles=u.roles,
        is_active=u.is_active,
        is_superuser=u.is_superuser,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """List all users in the current tenant."""
    users = await list_users_by_tenant(tenant_id)
    return [_user_response(u) for u in users]


@router.post("/users/invite", status_code=status.HTTP_201_CREATED)
async def invite_user(
    payload: InviteUserRequest,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Invite a new user to the current tenant with a temporary password.

    Returns the created user plus the one-time temporary password so the admin
    can share it. A delivery email is also queued if SMTP is configured.
    """
    existing = await get_user_by_email(payload.email)
    if existing:
        raise ConflictError("A user with this email already exists.")

    import secrets
    temp_password = secrets.token_urlsafe(12)

    full_name = payload.full_name or payload.email.split("@")[0].replace(".", " ").title()

    user = await create_user(
        email=payload.email,
        hashed_password=hash_password(temp_password),
        full_name=full_name,
        tenant_id=tenant_id,
        roles=payload.roles,
    )

    # Queue invitation email (best-effort — won't fail the request if SMTP not configured)
    try:
        from apps.notifications.tasks import send_notification_task
        from apps.notifications.repository import get_template_by_slug
        _inv_ctx = {"full_name": payload.full_name or payload.email, "temp_password": temp_password}
        _inv_tmpl = await get_template_by_slug("user-invite", tenant_id)
        send_notification_task.delay(
            channel="email",
            recipient=payload.email,
            template_id=str(_inv_tmpl.id) if _inv_tmpl else None,
            context=_inv_ctx,
            tenant_id=tenant_id,
            subject=_inv_tmpl.subject_template if _inv_tmpl else "You have been invited to Stackless",
            body=None if _inv_tmpl else (
                f"Hello {payload.full_name or payload.email},\n\n"
                f"You have been invited to join a Stackless workspace.\n\n"
                f"Email: {payload.email}\n"
                f"Temporary password: {temp_password}\n\n"
                f"Please log in and change your password immediately."
            ),
        )
    except Exception:
        pass  # Email delivery is best-effort

    # Return user + temp password so admin can share it manually if needed
    user_data = _user_response(user).model_dump()
    user_data["temp_password"] = temp_password
    return user_data


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user_admin(
    user_id: str,
    payload: AdminUserUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Update a user's profile, roles, or active status (admin only)."""
    user = await get_user_by_id(user_id)
    if not user or user.tenant_id != tenant_id:
        raise NotFoundError("User", user_id)
    kwargs = payload.model_dump(exclude_none=True)
    if "email" in kwargs and kwargs["email"] != user.email:
        existing = await get_user_by_email(kwargs["email"])
        if existing:
            raise ConflictError("A user with this email already exists.")
    updated = await update_user(user, **kwargs)
    return _user_response(updated)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user(
    user_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
):
    """Deactivate a user from the tenant (soft delete)."""
    user = await get_user_by_id(user_id)
    if not user or user.tenant_id != tenant_id:
        raise NotFoundError("User", user_id)
    await update_user(user, is_active=False)


# ── OAuth / SSO ───────────────────────────────────────────────────────────────

async def _oauth_upsert_user(email: str, full_name: str, provider: str) -> "TokenResponse":
    """Find or create a user by email from an OAuth provider, then issue tokens."""
    from apps.auth.service import _build_token_response, save_refresh_token
    from core.config import get_settings as _get_settings
    from datetime import datetime, timedelta, timezone

    _settings = _get_settings()

    user = await get_user_by_email(email)
    if user is None:
        user = await create_user(
            email=email,
            hashed_password=hash_password(f"oauth:{provider}:{email}"),  # unusable password
            full_name=full_name,
            tenant_id=None,
        )
        # Auto-provision a workspace for new OAuth users (same as regular registration)
        try:
            from apps.tenants.service import create_new_tenant
            from apps.tenants.schemas import TenantCreate
            import secrets
            slug = f"{email.split('@')[0].lower().replace('.', '-')}-{secrets.token_hex(3)}"
            tenant = await create_new_tenant(
                TenantCreate(name=f"{full_name}'s Workspace", slug=slug),
                owner_id=str(user.id),
            )
            user = await get_user_by_id(str(user.id))  # reload with tenant_id
        except Exception:
            pass  # Fallback: auto-provisioning in get_tenant_id dependency
    elif not user.is_active:
        raise UnauthorizedError("Your account is disabled.")

    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=_settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(user_id=str(user.id), token=tokens.refresh_token, expires_at=expires_at)
    return tokens


@router.post("/onboarding-complete", status_code=status.HTTP_200_OK)
async def complete_onboarding(current_user=Depends(get_current_active_user)):
    """Mark the current user's onboarding as complete."""
    from datetime import datetime, timezone
    current_user.onboarding_completed = True
    current_user.updated_at = datetime.now(tz=timezone.utc)
    await current_user.save()
    return {"message": "Onboarding completed"}


@router.get("/google/login")
async def google_login():
    """Redirect the user to Google's OAuth consent screen."""
    from fastapi.responses import RedirectResponse
    from core.config import get_settings as _get_settings
    import urllib.parse

    _settings = _get_settings()
    if not _settings.GOOGLE_CLIENT_ID:
        raise NotFoundError("Google OAuth", "not configured")

    import secrets as _secrets
    state = _secrets.token_urlsafe(16)
    params = urllib.parse.urlencode({
        "client_id": _settings.GOOGLE_CLIENT_ID,
        "redirect_uri": f"{_settings.APP_BASE_URL}/api/v1/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
    })
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback", response_model=TokenResponse)
async def google_callback(code: str):
    """Exchange Google auth code for Stackless tokens."""
    import httpx
    from core.config import get_settings as _get_settings

    _settings = _get_settings()
    if not _settings.GOOGLE_CLIENT_ID:
        raise NotFoundError("Google OAuth", "not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": _settings.GOOGLE_CLIENT_ID,
            "client_secret": _settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": f"{_settings.APP_BASE_URL}/api/v1/auth/google/callback",
            "grant_type": "authorization_code",
        })
        token_resp.raise_for_status()
        token_data = token_resp.json()

        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        info = userinfo_resp.json()

    email = info.get("email")
    if not email:
        raise UnauthorizedError("Google did not return an email address.")

    return await _oauth_upsert_user(
        email=email,
        full_name=info.get("name", email),
        provider="google",
    )


@router.get("/github/login")
async def github_login():
    """Redirect the user to GitHub's OAuth consent screen."""
    from fastapi.responses import RedirectResponse
    from core.config import get_settings as _get_settings
    import urllib.parse

    _settings = _get_settings()
    if not _settings.GITHUB_CLIENT_ID:
        raise NotFoundError("GitHub OAuth", "not configured")

    import secrets as _secrets
    state = _secrets.token_urlsafe(16)
    params = urllib.parse.urlencode({
        "client_id": _settings.GITHUB_CLIENT_ID,
        "redirect_uri": f"{_settings.APP_BASE_URL}/api/v1/auth/github/callback",
        "scope": "read:user user:email",
        "state": state,
    })
    return RedirectResponse(url=f"https://github.com/login/oauth/authorize?{params}")


@router.get("/github/callback", response_model=TokenResponse)
async def github_callback(code: str):
    """Exchange GitHub auth code for Stackless tokens."""
    import httpx
    from core.config import get_settings as _get_settings

    _settings = _get_settings()
    if not _settings.GITHUB_CLIENT_ID:
        raise NotFoundError("GitHub OAuth", "not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": _settings.GITHUB_CLIENT_ID,
                "client_secret": _settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{_settings.APP_BASE_URL}/api/v1/auth/github/callback",
            },
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise UnauthorizedError("GitHub OAuth failed: no access token returned.")

        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        )
        user_resp.raise_for_status()
        gh_user = user_resp.json()

        # GitHub may not expose email publicly; fetch primary verified email
        email = gh_user.get("email")
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
            )
            emails_resp.raise_for_status()
            for e in emails_resp.json():
                if e.get("primary") and e.get("verified"):
                    email = e["email"]
                    break

    if not email:
        raise UnauthorizedError("GitHub did not return a verified email address.")

    return await _oauth_upsert_user(
        email=email,
        full_name=gh_user.get("name") or gh_user.get("login") or email,
        provider="github",
    )
