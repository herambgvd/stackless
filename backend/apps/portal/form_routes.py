from __future__ import annotations

import httpx
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from apps.portal.form_models import PortalForm
from apps.portal.form_schemas import PortalFormCreate, PortalFormResponse, PortalFormUpdate
from apps.schema_engine.repository import get_model_by_slug, list_models
from core.config import get_settings
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError, ValidationError


async def _verify_recaptcha(token: str) -> bool:
    """Verify a reCAPTCHA v2 token with Google. Returns True if valid."""
    settings = get_settings()
    if not settings.RECAPTCHA_SECRET_KEY:
        return True  # captcha not configured — allow through
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": settings.RECAPTCHA_SECRET_KEY, "response": token},
            timeout=5,
        )
    data = resp.json()
    return bool(data.get("success", False))

router = APIRouter()


def _to_response(f: PortalForm) -> PortalFormResponse:
    return PortalFormResponse(
        id=str(f.id),
        tenant_id=f.tenant_id,
        app_id=f.app_id,
        model_slug=f.model_slug,
        slug=f.slug,
        title=f.title,
        description=f.description,
        submit_button_text=f.submit_button_text,
        success_message=f.success_message,
        steps=[{"title": s.title, "description": s.description, "fields": s.fields} for s in f.steps],
        is_published=f.is_published,
        require_captcha=f.require_captcha,
        confirmation_email_enabled=f.confirmation_email_enabled,
        confirmation_email_field=f.confirmation_email_field,
        confirmation_email_subject=f.confirmation_email_subject,
        confirmation_email_body=f.confirmation_email_body,
        logo_url=f.logo_url,
        primary_color=f.primary_color,
        background_color=f.background_color,
        font_family=f.font_family,
        custom_css=f.custom_css,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


@router.get("/apps/{app_id}/portal-forms", response_model=list[PortalFormResponse])
async def list_portal_forms(
    app_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    forms = await PortalForm.find(
        PortalForm.app_id == app_id,
        PortalForm.tenant_id == tenant_id,
    ).to_list()
    return [_to_response(f) for f in forms]


@router.post("/apps/{app_id}/portal-forms", response_model=PortalFormResponse, status_code=status.HTTP_201_CREATED)
async def create_portal_form(
    app_id: str,
    payload: PortalFormCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("apps", "update")),
):
    # Check slug uniqueness
    existing = await PortalForm.find_one(
        PortalForm.tenant_id == tenant_id,
        PortalForm.slug == payload.slug,
    )
    if existing:
        raise ValidationError(f"Form slug '{payload.slug}' is already taken.")

    from apps.portal.form_models import FormStep
    steps = [FormStep(**s.model_dump()) for s in payload.steps]
    f = PortalForm(
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug=payload.model_slug,
        slug=payload.slug,
        title=payload.title,
        description=payload.description,
        submit_button_text=payload.submit_button_text,
        success_message=payload.success_message,
        steps=steps,
        is_published=payload.is_published,
        require_captcha=payload.require_captcha,
        confirmation_email_enabled=payload.confirmation_email_enabled,
        confirmation_email_field=payload.confirmation_email_field,
        confirmation_email_subject=payload.confirmation_email_subject,
        confirmation_email_body=payload.confirmation_email_body,
        created_by=str(current_user.id),
    )
    await f.insert()
    return _to_response(f)


@router.put("/apps/{app_id}/portal-forms/{form_id}", response_model=PortalFormResponse)
async def update_portal_form(
    app_id: str,
    form_id: str,
    payload: PortalFormUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(form_id)
    except Exception:
        raise NotFoundError("PortalForm", form_id)
    f = await PortalForm.get(oid)
    if not f or f.app_id != app_id or f.tenant_id != tenant_id:
        raise NotFoundError("PortalForm", form_id)
    update_data = payload.model_dump(exclude_none=True)
    if "steps" in update_data:
        from apps.portal.form_models import FormStep
        update_data["steps"] = [FormStep(**s) for s in update_data["steps"]]
    for k, v in update_data.items():
        setattr(f, k, v)
    f.updated_at = datetime.now(tz=timezone.utc)
    await f.save()
    return _to_response(f)


@router.delete("/apps/{app_id}/portal-forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portal_form(
    app_id: str,
    form_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("apps", "update")),
):
    try:
        oid = PydanticObjectId(form_id)
    except Exception:
        raise NotFoundError("PortalForm", form_id)
    f = await PortalForm.get(oid)
    if not f or f.app_id != app_id or f.tenant_id != tenant_id:
        raise NotFoundError("PortalForm", form_id)
    await f.delete()


# ── Public endpoint — no auth ───────────────────────────────────────────────

@router.get("/public/forms/{tenant_id}/{form_slug}")
async def get_public_form(tenant_id: str, form_slug: str):
    """Return the form schema for public rendering. No auth required."""
    form = await PortalForm.find_one(
        PortalForm.tenant_id == tenant_id,
        PortalForm.slug == form_slug,
        PortalForm.is_published == True,
    )
    if not form:
        raise NotFoundError("Form", form_slug)

    model = await get_model_by_slug(form.model_slug, form.app_id)
    if not model:
        raise NotFoundError("Model", form.model_slug)

    fields_by_name = {f.name: {
        "name": f.name,
        "label": f.label or f.name,
        "type": f.type,
        "config": f.config,
        "is_required": f.is_required,
    } for f in model.fields}

    # Build step field specs
    if form.steps:
        steps = [
            {
                "title": s.title,
                "description": s.description,
                "fields": [fields_by_name[fname] for fname in s.fields if fname in fields_by_name],
            }
            for s in form.steps
        ]
    else:
        # Single step with all fields
        steps = [{
            "title": "Fill in the details",
            "description": None,
            "fields": list(fields_by_name.values()),
        }]

    settings = get_settings()
    return {
        "id": str(form.id),
        "title": form.title,
        "description": form.description,
        "submit_button_text": form.submit_button_text,
        "success_message": form.success_message,
        "steps": steps,
        "app_id": form.app_id,
        "model_slug": form.model_slug,
        "tenant_id": form.tenant_id,
        "require_captcha": form.require_captcha,
        "site_key": settings.RECAPTCHA_SITE_KEY if form.require_captcha else None,
    }


@router.post("/public/forms/{tenant_id}/{form_slug}/submit", status_code=status.HTTP_201_CREATED)
async def submit_public_form(
    tenant_id: str,
    form_slug: str,
    payload: dict,
    request: Request,
):
    """Submit a multi-step public form. No auth required."""
    form = await PortalForm.find_one(
        PortalForm.tenant_id == tenant_id,
        PortalForm.slug == form_slug,
        PortalForm.is_published == True,
    )
    if not form:
        raise NotFoundError("Form", form_slug)

    if form.require_captcha:
        captcha_token = payload.get("captcha_token")
        if not captcha_token:
            raise HTTPException(status_code=422, detail="reCAPTCHA token is required.")
        if not await _verify_recaptcha(captcha_token):
            raise HTTPException(status_code=422, detail="reCAPTCHA verification failed. Please try again.")

    ip = request.client.host if request.client else None

    # If the request carries a valid Bearer token, capture the user_id as submitted_by
    submitted_by: str | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from core.security import verify_access_token
        token_payload = verify_access_token(auth_header[7:])
        if token_payload and token_payload.get("sub"):
            submitted_by = token_payload["sub"]

    from apps.portal.service import submit_portal_form
    submission_data = payload.get("data", payload)
    result = await submit_portal_form(
        app_id=form.app_id,
        tenant_id=tenant_id,
        data=submission_data,
        model_slug=form.model_slug,
        submitted_by=submitted_by,
        ip_address=ip,
    )

    # Send confirmation email if enabled
    if form.confirmation_email_enabled and form.confirmation_email_field:
        email_address = submission_data.get(form.confirmation_email_field)
        if email_address and isinstance(email_address, str) and "@" in email_address:
            try:
                from apps.notifications.channels.email import EmailChannel
                channel = EmailChannel()
                await channel.send(
                    recipient=email_address,
                    subject_template=form.confirmation_email_subject or "Thank you for your submission",
                    body_template=form.confirmation_email_body or "<p>Thank you! Your submission has been received.</p>",
                    context={"data": submission_data, "form_title": form.title},
                )
            except Exception:
                pass  # Don't fail the submission if confirmation email fails

    return result


@router.post("/public/forms/{tenant_id}/{form_slug}/upload-file")
async def upload_public_form_file(
    tenant_id: str,
    form_slug: str,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload a file during public form fill. No auth required. Returns file metadata."""
    form = await PortalForm.find_one(
        PortalForm.tenant_id == tenant_id,
        PortalForm.slug == form_slug,
        PortalForm.is_published == True,
    )
    if not form:
        raise NotFoundError("Form", form_slug)

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
        app_id=form.app_id,
        model_slug=form.model_slug or "portal",
    )
