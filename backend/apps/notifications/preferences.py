from __future__ import annotations

from datetime import datetime, timezone

from beanie import Document
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from pymongo import IndexModel

from core.dependencies import get_current_active_user, get_tenant_id

# ── Model ─────────────────────────────────────────────────────────────────────


class NotificationPreference(Document):
    """Per-user notification channel preferences."""

    user_id: str
    tenant_id: str

    # In-app (always enabled — cannot be turned off)
    inapp_mentions: bool = True
    inapp_assignments: bool = True
    inapp_approvals: bool = True

    # Email
    email_mentions: bool = False
    email_assignments: bool = True
    email_approvals: bool = True
    email_digest: bool = False          # daily summary digest
    digest_frequency: str = "daily"     # daily | weekly

    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "notification_preferences"
        indexes = [
            IndexModel([("user_id", 1), ("tenant_id", 1)], unique=True),
        ]


# ── Schemas ───────────────────────────────────────────────────────────────────


class PreferenceResponse(BaseModel):
    inapp_mentions: bool
    inapp_assignments: bool
    inapp_approvals: bool
    email_mentions: bool
    email_assignments: bool
    email_approvals: bool
    email_digest: bool
    digest_frequency: str


class PreferenceUpdate(BaseModel):
    inapp_mentions: bool | None = None
    inapp_assignments: bool | None = None
    inapp_approvals: bool | None = None
    email_mentions: bool | None = None
    email_assignments: bool | None = None
    email_approvals: bool | None = None
    email_digest: bool | None = None
    digest_frequency: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

router = APIRouter()


async def _get_or_create(user_id: str, tenant_id: str) -> NotificationPreference:
    pref = await NotificationPreference.find_one(
        NotificationPreference.user_id == user_id,
        NotificationPreference.tenant_id == tenant_id,
    )
    if pref is None:
        pref = NotificationPreference(user_id=user_id, tenant_id=tenant_id)
        await pref.insert()
    return pref


def _to_response(p: NotificationPreference) -> PreferenceResponse:
    return PreferenceResponse(
        inapp_mentions=p.inapp_mentions,
        inapp_assignments=p.inapp_assignments,
        inapp_approvals=p.inapp_approvals,
        email_mentions=p.email_mentions,
        email_assignments=p.email_assignments,
        email_approvals=p.email_approvals,
        email_digest=p.email_digest,
        digest_frequency=p.digest_frequency,
    )


@router.get("/notifications/preferences", response_model=PreferenceResponse)
async def get_preferences(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    pref = await _get_or_create(str(current_user.id), tenant_id)
    return _to_response(pref)


@router.put("/notifications/preferences", response_model=PreferenceResponse)
async def update_preferences(
    payload: PreferenceUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    pref = await _get_or_create(str(current_user.id), tenant_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(pref, field, value)
    pref.updated_at = datetime.now(tz=timezone.utc)
    await pref.save()
    return _to_response(pref)
