from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel


class LetterHead(Document):
    """Company letter head — appears at the top (and optionally bottom) of printed documents."""
    name: str
    tenant_id: str
    company_name: str = ""
    logo_url: Optional[str] = None     # public URL or base64 data URI
    address: Optional[str] = None      # multi-line address text
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    header_html: Optional[str] = None  # custom HTML for the header section
    footer_html: Optional[str] = None  # custom HTML for the footer section
    is_default: bool = False
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "letter_heads"
        indexes = [
            IndexModel([("tenant_id", 1)]),
        ]


class PrintFormat(Document):
    """User-defined HTML print template for a model.

    The html_template is a Jinja2 template rendered with the record's field
    values as context variables (e.g. {{ name }}, {{ status }}).
    Special variables available: _record (full dict), _model_name, _printed_at.
    """
    name: str
    app_id: str
    model_slug: str
    tenant_id: str
    html_template: str = ""
    is_default: bool = False
    letter_head_id: Optional[str] = None   # reference to a LetterHead document
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "print_formats"
        indexes = [
            IndexModel([("tenant_id", 1), ("app_id", 1), ("model_slug", 1)]),
        ]
