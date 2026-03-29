from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from apps.calendar.models import CalendarEvent
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import ForbiddenError, NotFoundError, ValidationError

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    title: str
    description: str = ""
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    color: str = "#6366f1"
    location: str = ""
    attendee_ids: list[str] = []
    record_app_id: str | None = None
    record_id: str | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    color: str | None = None
    location: str | None = None
    attendee_ids: list[str] | None = None


def _to_dict(e: CalendarEvent) -> dict:
    return {
        "id": str(e.id),
        "title": e.title,
        "description": e.description,
        "start_at": e.start_at.isoformat(),
        "end_at": e.end_at.isoformat(),
        "all_day": e.all_day,
        "color": e.color,
        "location": e.location,
        "creator_id": e.creator_id,
        "creator_name": e.creator_name,
        "attendee_ids": e.attendee_ids,
        "record_app_id": e.record_app_id,
        "record_id": e.record_id,
        "created_at": e.created_at.isoformat(),
        "updated_at": e.updated_at.isoformat(),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    start: str = Query(..., description="ISO datetime — range start"),
    end: str = Query(..., description="ISO datetime — range end"),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Return all tenant events that overlap the [start, end] window."""
    try:
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Invalid ISO datetime in start/end")

    events = await CalendarEvent.find(
        CalendarEvent.tenant_id == tenant_id,
        CalendarEvent.start_at < end_dt,
        CalendarEvent.end_at > start_dt,
    ).sort(CalendarEvent.start_at).to_list()

    return [_to_dict(e) for e in events]


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    if not payload.all_day and payload.start_at >= payload.end_at:
        raise ValidationError("start_at must be before end_at.")
    ev = CalendarEvent(
        tenant_id=tenant_id,
        title=payload.title,
        description=payload.description or None,
        start_at=payload.start_at,
        end_at=payload.end_at,
        all_day=payload.all_day,
        color=payload.color,
        location=payload.location or None,
        creator_id=str(current_user.id),
        creator_name=current_user.full_name or current_user.email,
        attendee_ids=payload.attendee_ids,
        record_app_id=payload.record_app_id,
        record_id=payload.record_id,
    )
    await ev.insert()
    return _to_dict(ev)


@router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    payload: EventUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(event_id)
    except Exception:
        raise NotFoundError("CalendarEvent", event_id)
    ev = await CalendarEvent.get(oid)
    if not ev or ev.tenant_id != tenant_id:
        raise NotFoundError("CalendarEvent", event_id)
    # Only creator can edit
    if ev.creator_id != str(current_user.id) and not (
        current_user.is_superuser or "admin" in (current_user.roles or [])
    ):
        raise ForbiddenError("Only the event creator can edit this event")

    updates = payload.model_dump(exclude_none=True)
    new_start = updates.get("start_at", ev.start_at)
    new_end = updates.get("end_at", ev.end_at)
    if not updates.get("all_day", ev.all_day) and new_start >= new_end:
        raise ValidationError("start_at must be before end_at.")
    for field, value in updates.items():
        setattr(ev, field, value)
    ev.updated_at = datetime.now(tz=timezone.utc)
    await ev.save()
    return _to_dict(ev)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(event_id)
    except Exception:
        raise NotFoundError("CalendarEvent", event_id)
    ev = await CalendarEvent.get(oid)
    if not ev or ev.tenant_id != tenant_id:
        raise NotFoundError("CalendarEvent", event_id)
    if ev.creator_id != str(current_user.id) and not (
        current_user.is_superuser or "admin" in (current_user.roles or [])
    ):
        raise ForbiddenError("Only the event creator can delete this event")
    await ev.delete()
