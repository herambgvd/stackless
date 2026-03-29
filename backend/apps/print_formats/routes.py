from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from apps.print_formats.models import PrintFormat, LetterHead
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

from typing import Optional

class LetterHeadCreate(BaseModel):
    name: str
    company_name: str = ""
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    header_html: Optional[str] = None
    footer_html: Optional[str] = None
    is_default: bool = False


class LetterHeadUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    header_html: Optional[str] = None
    footer_html: Optional[str] = None
    is_default: Optional[bool] = None


class LetterHeadResponse(BaseModel):
    id: str
    name: str
    tenant_id: str
    company_name: str
    logo_url: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    header_html: Optional[str]
    footer_html: Optional[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime


def _lh_to_response(lh: LetterHead) -> LetterHeadResponse:
    return LetterHeadResponse(
        id=str(lh.id),
        name=lh.name,
        tenant_id=lh.tenant_id,
        company_name=lh.company_name,
        logo_url=lh.logo_url,
        address=lh.address,
        phone=lh.phone,
        email=lh.email,
        website=lh.website,
        header_html=lh.header_html,
        footer_html=lh.footer_html,
        is_default=lh.is_default,
        created_at=lh.created_at,
        updated_at=lh.updated_at,
    )


# ── Letter Head endpoints ──────────────────────────────────────────────────────

@router.get("/letter-heads", response_model=list[LetterHeadResponse])
async def list_letter_heads(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    lhs = await LetterHead.find(LetterHead.tenant_id == tenant_id).sort(LetterHead.created_at).to_list()
    return [_lh_to_response(lh) for lh in lhs]


@router.post("/letter-heads", response_model=LetterHeadResponse, status_code=status.HTTP_201_CREATED)
async def create_letter_head(
    payload: LetterHeadCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("schema", "create")),
):
    if payload.is_default:
        await LetterHead.find(LetterHead.tenant_id == tenant_id, LetterHead.is_default == True).update(
            {"$set": {"is_default": False}}
        )
    lh = LetterHead(
        tenant_id=tenant_id,
        created_by=str(current_user.id),
        **payload.model_dump(),
    )
    await lh.insert()
    return _lh_to_response(lh)


@router.put("/letter-heads/{lh_id}", response_model=LetterHeadResponse)
async def update_letter_head(
    lh_id: str,
    payload: LetterHeadUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "update")),
):
    from beanie import PydanticObjectId as OId
    try:
        oid = OId(lh_id)
    except Exception:
        raise NotFoundError("LetterHead", lh_id)
    lh = await LetterHead.get(oid)
    if not lh or lh.tenant_id != tenant_id:
        raise NotFoundError("LetterHead", lh_id)
    if payload.is_default:
        await LetterHead.find(LetterHead.tenant_id == tenant_id, LetterHead.is_default == True).update(
            {"$set": {"is_default": False}}
        )
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(lh, k, v)
    lh.updated_at = datetime.now(tz=timezone.utc)
    await lh.save()
    return _lh_to_response(lh)


@router.delete("/letter-heads/{lh_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_letter_head(
    lh_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "delete")),
):
    from beanie import PydanticObjectId as OId
    try:
        oid = OId(lh_id)
    except Exception:
        raise NotFoundError("LetterHead", lh_id)
    lh = await LetterHead.get(oid)
    if not lh or lh.tenant_id != tenant_id:
        raise NotFoundError("LetterHead", lh_id)
    await lh.delete()


class PrintFormatCreate(BaseModel):
    name: str
    html_template: str = ""
    is_default: bool = False
    letter_head_id: Optional[str] = None


class PrintFormatUpdate(BaseModel):
    name: str | None = None
    html_template: str | None = None
    is_default: bool | None = None
    letter_head_id: Optional[str] = None


class PrintFormatResponse(BaseModel):
    id: str
    name: str
    app_id: str
    model_slug: str
    tenant_id: str
    html_template: str
    is_default: bool
    letter_head_id: Optional[str] = None
    created_by: str
    created_at: datetime
    updated_at: datetime


def _to_response(pf: PrintFormat) -> PrintFormatResponse:
    return PrintFormatResponse(
        id=str(pf.id),
        name=pf.name,
        app_id=pf.app_id,
        model_slug=pf.model_slug,
        tenant_id=pf.tenant_id,
        html_template=pf.html_template,
        is_default=pf.is_default,
        letter_head_id=getattr(pf, "letter_head_id", None),
        created_by=pf.created_by,
        created_at=pf.created_at,
        updated_at=pf.updated_at,
    )


# ── CRUD endpoints ─────────────────────────────────────────────────────────────

@router.get(
    "/apps/{app_id}/{model_slug}/print-formats",
    response_model=list[PrintFormatResponse],
)
async def list_print_formats(
    app_id: str,
    model_slug: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    formats = await PrintFormat.find(
        PrintFormat.tenant_id == tenant_id,
        PrintFormat.app_id == app_id,
        PrintFormat.model_slug == model_slug,
    ).sort(PrintFormat.created_at).to_list()
    return [_to_response(pf) for pf in formats]


@router.post(
    "/apps/{app_id}/{model_slug}/print-formats",
    response_model=PrintFormatResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_print_format(
    app_id: str,
    model_slug: str,
    payload: PrintFormatCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("schema", "create")),
):
    if payload.is_default:
        # Clear previous default
        await PrintFormat.find(
            PrintFormat.tenant_id == tenant_id,
            PrintFormat.app_id == app_id,
            PrintFormat.model_slug == model_slug,
            PrintFormat.is_default == True,
        ).update({"$set": {"is_default": False}})

    pf = PrintFormat(
        name=payload.name,
        app_id=app_id,
        model_slug=model_slug,
        tenant_id=tenant_id,
        html_template=payload.html_template,
        is_default=payload.is_default,
        letter_head_id=payload.letter_head_id,
        created_by=str(current_user.id),
    )
    await pf.insert()
    return _to_response(pf)


@router.put(
    "/apps/{app_id}/{model_slug}/print-formats/{format_id}",
    response_model=PrintFormatResponse,
)
async def update_print_format(
    app_id: str,
    model_slug: str,
    format_id: str,
    payload: PrintFormatUpdate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "update")),
):
    try:
        oid = PydanticObjectId(format_id)
    except Exception:
        raise NotFoundError("PrintFormat", format_id)
    pf = await PrintFormat.get(oid)
    if not pf or pf.tenant_id != tenant_id:
        raise NotFoundError("PrintFormat", format_id)

    if payload.name is not None:
        pf.name = payload.name
    if payload.html_template is not None:
        pf.html_template = payload.html_template
    if payload.is_default is not None:
        if payload.is_default:
            await PrintFormat.find(
                PrintFormat.tenant_id == tenant_id,
                PrintFormat.app_id == app_id,
                PrintFormat.model_slug == model_slug,
                PrintFormat.is_default == True,
            ).update({"$set": {"is_default": False}})
        pf.is_default = payload.is_default
    if payload.letter_head_id is not None:
        pf.letter_head_id = payload.letter_head_id or None
    pf.updated_at = datetime.now(tz=timezone.utc)
    await pf.save()
    return _to_response(pf)


@router.delete(
    "/apps/{app_id}/{model_slug}/print-formats/{format_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_print_format(
    app_id: str,
    model_slug: str,
    format_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("schema", "delete")),
):
    try:
        oid = PydanticObjectId(format_id)
    except Exception:
        raise NotFoundError("PrintFormat", format_id)
    pf = await PrintFormat.get(oid)
    if not pf or pf.tenant_id != tenant_id:
        raise NotFoundError("PrintFormat", format_id)
    await pf.delete()


# ── Render endpoint ────────────────────────────────────────────────────────────

@router.get(
    "/apps/{app_id}/{model_slug}/records/{record_id}/print/{format_id}",
    response_class=HTMLResponse,
)
async def render_print_format(
    app_id: str,
    model_slug: str,
    record_id: str,
    format_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Render a print format for a specific record and return HTML."""
    try:
        oid = PydanticObjectId(format_id)
    except Exception:
        raise NotFoundError("PrintFormat", format_id)
    pf = await PrintFormat.get(oid)
    if not pf or pf.tenant_id != tenant_id:
        raise NotFoundError("PrintFormat", format_id)

    # Fetch record
    from apps.schema_engine.service import get_record
    record = await get_record(
        model_slug=model_slug,
        app_id=app_id,
        tenant_id=tenant_id,
        record_id=record_id,
    )

    # Fetch model name
    from apps.schema_engine.models import ModelDefinition
    model_def = await ModelDefinition.find_one(
        ModelDefinition.app_id == app_id,
        ModelDefinition.slug == model_slug,
        ModelDefinition.tenant_id == tenant_id,
    )
    model_name = model_def.name if model_def else model_slug

    # Load letter head if configured
    letter_head: LetterHead | None = None
    lh_id = getattr(pf, "letter_head_id", None)
    if lh_id:
        try:
            from beanie import PydanticObjectId as OId
            lh_oid = OId(lh_id)
            letter_head = await LetterHead.get(lh_oid)
            if letter_head and letter_head.tenant_id != tenant_id:
                letter_head = None
        except Exception:
            letter_head = None

    # Build letter head header HTML
    import html as _html

    def _build_lh_header(lh: LetterHead) -> str:
        if lh.header_html:
            return lh.header_html
        logo = f'<img src="{_html.escape(lh.logo_url)}" style="max-height:64px;max-width:200px;object-fit:contain;" alt="logo" />' if lh.logo_url else ""
        addr_lines = [
            f"<strong>{_html.escape(lh.company_name)}</strong>" if lh.company_name else "",
            _html.escape(lh.address).replace("\n", "<br>") if lh.address else "",
            f"Tel: {_html.escape(lh.phone)}" if lh.phone else "",
            f'Email: <a href="mailto:{_html.escape(lh.email)}">{_html.escape(lh.email)}</a>' if lh.email else "",
            f'<a href="{_html.escape(lh.website)}">{_html.escape(lh.website)}</a>' if lh.website else "",
        ]
        addr_block = "<br>".join(line for line in addr_lines if line)
        return f"""<div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:12px;margin-bottom:16px;border-bottom:2px solid #e5e7eb;">
  <div>{logo}</div>
  <div style="text-align:right;font-size:13px;line-height:1.6;">{addr_block}</div>
</div>"""

    def _build_lh_footer(lh: LetterHead) -> str:
        if lh.footer_html:
            return lh.footer_html
        parts = [_html.escape(p) for p in [lh.company_name, lh.phone, lh.email, lh.website] if p]
        line = " · ".join(parts)
        return f'<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#6b7280;">{line}</div>' if line else ""

    header_html = _build_lh_header(letter_head) if letter_head else ""
    footer_html = _build_lh_footer(letter_head) if letter_head else ""

    # Render with Jinja2
    from jinja2 import Environment, Undefined
    env = Environment(undefined=Undefined, autoescape=True)
    context = {
        **record,
        "_record": record,
        "_model_name": model_name,
        "_printed_at": datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    try:
        body_html = env.from_string(pf.html_template).render(**context)
    except Exception as exc:
        body_html = f"<p style='color:red'>Template error: {exc}</p>"

    # Wrap in a print-ready HTML shell
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{pf.name} — {record.get('_name') or record.get('name') or record_id}</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 2rem; color: #111; }}
  @media print {{ body {{ padding: 0; }} }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ border: 1px solid #ddd; padding: 6px 10px; text-align: left; }}
  th {{ background: #f5f5f5; font-weight: 600; }}
</style>
</head>
<body onload="window.print()">
{header_html}
{body_html}
{footer_html}
</body>
</html>"""
    return HTMLResponse(content=html)
