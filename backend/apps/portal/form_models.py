from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from beanie import Document
from pydantic import BaseModel


class FormStep(BaseModel):
    title: str
    description: Optional[str] = None
    fields: list[str]  # ordered list of field names to show in this step


class PortalForm(Document):
    """A configured multi-step public form."""
    tenant_id: str
    app_id: str
    model_slug: str
    slug: str                           # URL-friendly identifier
    title: str
    description: Optional[str] = None
    submit_button_text: str = "Submit"
    success_message: str = "Thank you! Your submission has been received."
    steps: list[FormStep] = []          # empty = single step with all fields
    is_published: bool = False
    require_captcha: bool = False
    # Confirmation email
    confirmation_email_enabled: bool = False
    confirmation_email_field: Optional[str] = None   # field name containing submitter's email
    confirmation_email_subject: str = "Thank you for your submission"
    confirmation_email_body: str = "<p>Hi,</p><p>We have received your submission. Thank you!</p>"
    # Per-form branding
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None     # hex, e.g. "#6366f1"
    background_color: Optional[str] = None  # hex, e.g. "#f9fafb"
    font_family: Optional[str] = None       # e.g. "Inter"
    custom_css: Optional[str] = None        # injected into <style> on the public page

    created_by: str
    created_at: datetime = None
    updated_at: datetime = None

    def __init__(self, **data):
        if data.get("created_at") is None:
            data["created_at"] = datetime.now(tz=timezone.utc)
        if data.get("updated_at") is None:
            data["updated_at"] = datetime.now(tz=timezone.utc)
        super().__init__(**data)

    class Settings:
        name = "portal_forms"
        indexes = [
            [("tenant_id", 1), ("slug", 1)],
            [("app_id", 1), ("tenant_id", 1)],
        ]
