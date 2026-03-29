from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
import re


class FormStepSchema(BaseModel):
    title: str
    description: Optional[str] = None
    fields: list[str]


class PortalFormCreate(BaseModel):
    model_slug: str
    slug: str
    title: str
    description: Optional[str] = None
    submit_button_text: str = "Submit"
    success_message: str = "Thank you! Your submission has been received."
    steps: list[FormStepSchema] = []
    is_published: bool = False
    require_captcha: bool = False
    confirmation_email_enabled: bool = False
    confirmation_email_field: Optional[str] = None
    confirmation_email_subject: str = "Thank you for your submission"
    confirmation_email_body: str = "<p>Hi,</p><p>We have received your submission. Thank you!</p>"
    # Branding
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    background_color: Optional[str] = None
    font_family: Optional[str] = None
    custom_css: Optional[str] = None

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, v: str) -> str:
        v = v.strip().lower()
        v = re.sub(r"[^a-z0-9-]", "-", v)
        v = re.sub(r"-+", "-", v).strip("-")
        if not v:
            raise ValueError("slug cannot be empty")
        return v


class PortalFormUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    submit_button_text: Optional[str] = None
    success_message: Optional[str] = None
    steps: Optional[list[FormStepSchema]] = None
    is_published: Optional[bool] = None
    require_captcha: Optional[bool] = None
    confirmation_email_enabled: Optional[bool] = None
    confirmation_email_field: Optional[str] = None
    confirmation_email_subject: Optional[str] = None
    confirmation_email_body: Optional[str] = None
    # Branding
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    background_color: Optional[str] = None
    font_family: Optional[str] = None
    custom_css: Optional[str] = None


class PortalFormResponse(BaseModel):
    id: str
    tenant_id: str
    app_id: str
    model_slug: str
    slug: str
    title: str
    description: Optional[str]
    submit_button_text: str
    success_message: str
    steps: list[FormStepSchema]
    is_published: bool
    require_captcha: bool
    confirmation_email_enabled: bool = False
    confirmation_email_field: Optional[str] = None
    confirmation_email_subject: str = "Thank you for your submission"
    confirmation_email_body: str = ""
    # Branding
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    background_color: Optional[str] = None
    font_family: Optional[str] = None
    custom_css: Optional[str] = None
    created_at: datetime
    updated_at: datetime
