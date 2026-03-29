from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status

from apps.portal.schemas import (
    PortalAppSchema,
    PortalSchemaResponse,
    PortalSubmitRequest,
    PortalSubmissionResponse,
)
from apps.portal.service import get_portal_app_schema, get_portal_schema, submit_portal_form
from apps.portal.repository import list_submissions
from core.dependencies import get_current_active_user, get_tenant_id

router = APIRouter()

# ── Simple in-process rate limiter for public form submissions ────────────────
# Allows at most _RATE_LIMIT submissions per IP within a _RATE_WINDOW second window.
# For multi-process deployments replace this with a Redis-backed counter.
_RATE_LIMIT = 10       # max submissions
_RATE_WINDOW = 60      # per N seconds
_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = Lock()


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    cutoff = now - _RATE_WINDOW
    with _rate_lock:
        timestamps = _rate_store[ip]
        # Evict expired timestamps
        _rate_store[ip] = [t for t in timestamps if t > cutoff]
        if len(_rate_store[ip]) >= _RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Too many submissions. Limit: {_RATE_LIMIT} per {_RATE_WINDOW}s.",
                headers={"Retry-After": str(_RATE_WINDOW)},
            )
        _rate_store[ip].append(now)


@router.get("/apps/{app_id}/models", response_model=PortalAppSchema)
async def get_app_portal_models(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
):
    """Return all models and their field schemas for an app portal. Public endpoint."""
    return await get_portal_app_schema(app_id, tenant_id)


@router.get("/apps/{app_id}/schema", response_model=PortalSchemaResponse)
async def get_app_portal_schema(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
):
    """Return the first model's schema (backward compat). Public endpoint."""
    return await get_portal_schema(app_id, tenant_id)


@router.post(
    "/apps/{app_id}/submit",
    response_model=PortalSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_form(
    app_id: str,
    payload: PortalSubmitRequest,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
):
    """Submit a portal form to a specific model. Public endpoint — no auth required."""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)
    return await submit_portal_form(
        app_id=app_id,
        tenant_id=tenant_id,
        data=payload.data,
        model_slug=payload.model_slug,
        submitted_by=None,
        ip_address=ip,
    )


@router.post("/apps/{app_id}/upload-file")
async def upload_portal_file(
    app_id: str,
    request: Request,
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id),
):
    """Upload a file during authenticated portal form fill. Returns MinIO file metadata."""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    MAX_SIZE = 10 * 1024 * 1024  # 10 MB
    data = await file.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB).")

    from core.storage import upload_file as _upload
    return await _upload(
        file_bytes=data,
        content_type=file.content_type or "application/octet-stream",
        original_filename=file.filename or "upload",
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug="portal",
    )


@router.get("/apps/{app_id}/submissions", response_model=dict)
async def get_submissions(
    app_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """List all portal submissions for an app (requires auth)."""
    skip = (page - 1) * page_size
    items, total = await list_submissions(app_id, tenant_id, skip=skip, limit=page_size)
    return {
        "items": [
            {
                "id": str(s.id),
                "app_id": s.app_id,
                "model_slug": s.model_slug,
                "record_id": s.record_id,
                "data": s.data,
                "status": s.status,
                "submitted_by": s.submitted_by,
                "created_at": s.created_at,
            }
            for s in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (skip + len(items)) < total,
    }


@router.get("/apps/{app_id}/portal-forms/{form_id}/analytics")
async def get_form_analytics(
    app_id: str,
    form_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Return daily submission counts for a portal form (last 30 days)."""
    from apps.portal.models import PortalSubmission
    from apps.portal.form_models import PortalForm
    from beanie import PydanticObjectId
    from datetime import datetime, timedelta, timezone
    from core.database import get_motor_client
    from core.config import get_settings

    try:
        oid = PydanticObjectId(form_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    form = await PortalForm.get(oid)
    if not form or form.app_id != app_id or form.tenant_id != tenant_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    since = datetime.now(tz=timezone.utc) - timedelta(days=30)
    total = await PortalSubmission.find(
        PortalSubmission.app_id == app_id,
        PortalSubmission.tenant_id == tenant_id,
    ).count()

    recent_total = await PortalSubmission.find(
        PortalSubmission.app_id == app_id,
        PortalSubmission.tenant_id == tenant_id,
        PortalSubmission.created_at >= since,
    ).count()

    # Daily trend via aggregation
    settings = get_settings()
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]
    col = db["portal_submissions"]

    pipeline = [
        {"$match": {
            "app_id": app_id,
            "tenant_id": tenant_id,
            "created_at": {"$gte": since},
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$created_at"},
                "month": {"$month": "$created_at"},
                "day": {"$dayOfMonth": "$created_at"},
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
    ]
    docs = await col.aggregate(pipeline).to_list(None)
    trend = [
        {
            "date": f"{d['_id']['year']}-{d['_id']['month']:02d}-{d['_id']['day']:02d}",
            "count": d["count"],
        }
        for d in docs
    ]

    return {
        "total_submissions": total,
        "recent_submissions": recent_total,
        "trend": trend,
        "form_slug": form.slug,
        "form_title": form.title,
    }


# ── Customer Portal Auth ──────────────────────────────────────────────────────

@router.post("/public/{tenant_id}/auth/register", status_code=status.HTTP_201_CREATED)
async def portal_register(
    tenant_id: str,
    payload: dict,
):
    """
    Register a new portal (customer) user for a specific tenant.
    Creates a User with is_portal_user=True and the given tenant_id.
    """
    from fastapi import HTTPException
    from apps.auth.repository import get_user_by_email, create_user
    from apps.auth.service import _build_token_response, save_refresh_token
    from core.security import hash_password
    from datetime import datetime, timedelta, timezone
    from core.config import get_settings as _get_settings

    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    full_name = payload.get("full_name", email)

    if not email or not password:
        raise HTTPException(422, "email and password are required")

    existing = await get_user_by_email(email)
    if existing:
        raise HTTPException(409, "An account with this email already exists")

    user = await create_user(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        tenant_id=tenant_id,
        roles=["portal_user"],
    )

    _settings = _get_settings()
    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=_settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(user_id=str(user.id), token=tokens.refresh_token, expires_at=expires_at)
    return {"access_token": tokens.access_token, "refresh_token": tokens.refresh_token, "token_type": "bearer"}


@router.post("/public/{tenant_id}/auth/login")
async def portal_login(
    tenant_id: str,
    payload: dict,
):
    """Authenticate a portal user for a specific tenant."""
    from fastapi import HTTPException
    from apps.auth.repository import get_user_by_email
    from apps.auth.service import _build_token_response, save_refresh_token
    from core.security import verify_password
    from datetime import datetime, timedelta, timezone
    from core.config import get_settings as _get_settings

    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")

    if not email or not password:
        raise HTTPException(422, "email and password are required")

    user = await get_user_by_email(email)
    if not user or user.tenant_id != tenant_id or not user.is_active:
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    _settings = _get_settings()
    tokens = _build_token_response(user)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=_settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await save_refresh_token(user_id=str(user.id), token=tokens.refresh_token, expires_at=expires_at)
    return {"access_token": tokens.access_token, "refresh_token": tokens.refresh_token, "token_type": "bearer"}


@router.get("/public/{tenant_id}/me")
async def portal_me(
    tenant_id: str,
    current_user=Depends(get_current_active_user),
):
    """Return the authenticated portal user's profile."""
    from fastapi import HTTPException
    if current_user.tenant_id != tenant_id:
        raise HTTPException(403, "Forbidden")
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "tenant_id": current_user.tenant_id,
    }


@router.get("/public/{tenant_id}/my-submissions")
async def portal_my_submissions(
    tenant_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_active_user),
):
    """Return all portal form submissions made by the authenticated portal user."""
    from fastapi import HTTPException
    from apps.portal.models import PortalSubmission

    if current_user.tenant_id != tenant_id:
        raise HTTPException(403, "Forbidden")

    user_id = str(current_user.id)
    skip = (page - 1) * page_size

    items = await PortalSubmission.find(
        PortalSubmission.tenant_id == tenant_id,
        PortalSubmission.submitted_by == user_id,
    ).sort(-PortalSubmission.created_at).skip(skip).limit(page_size).to_list()

    total = await PortalSubmission.find(
        PortalSubmission.tenant_id == tenant_id,
        PortalSubmission.submitted_by == user_id,
    ).count()

    return {
        "items": [
            {
                "id": str(s.id),
                "form_slug": None,
                "model_slug": s.model_slug,
                "data": s.data,
                "status": s.status,
                "created_at": s.created_at.isoformat(),
            }
            for s in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
