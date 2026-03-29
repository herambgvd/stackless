from __future__ import annotations

from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from fastapi import APIRouter, Depends, status
from pymongo import IndexModel
from pydantic import Field

from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


class RecordFavourite(Document):
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        name = "record_favourites"
        indexes = [
            IndexModel(
                [("tenant_id", 1), ("app_id", 1), ("model_slug", 1), ("record_id", 1), ("user_id", 1)],
                unique=True,
            ),
        ]


@router.get("/schema/apps/{app_id}/{model_slug}/records/{record_id}/favourite")
async def get_favourite_status(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Check if the current user has favourited this record."""
    fav = await RecordFavourite.find_one(
        RecordFavourite.tenant_id == tenant_id,
        RecordFavourite.app_id == app_id,
        RecordFavourite.model_slug == model_slug,
        RecordFavourite.record_id == record_id,
        RecordFavourite.user_id == str(current_user.id),
    )
    return {"is_favourite": fav is not None}


@router.post(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/favourite",
    status_code=status.HTTP_201_CREATED,
)
async def add_favourite(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Mark a record as favourite for the current user."""
    existing = await RecordFavourite.find_one(
        RecordFavourite.tenant_id == tenant_id,
        RecordFavourite.app_id == app_id,
        RecordFavourite.model_slug == model_slug,
        RecordFavourite.record_id == record_id,
        RecordFavourite.user_id == str(current_user.id),
    )
    if existing:
        return {"is_favourite": True}

    fav = RecordFavourite(
        tenant_id=tenant_id,
        app_id=app_id,
        model_slug=model_slug,
        record_id=record_id,
        user_id=str(current_user.id),
    )
    await fav.insert()
    return {"is_favourite": True}


@router.delete(
    "/schema/apps/{app_id}/{model_slug}/records/{record_id}/favourite",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_favourite(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Remove a record from the current user's favourites."""
    fav = await RecordFavourite.find_one(
        RecordFavourite.tenant_id == tenant_id,
        RecordFavourite.app_id == app_id,
        RecordFavourite.model_slug == model_slug,
        RecordFavourite.record_id == record_id,
        RecordFavourite.user_id == str(current_user.id),
    )
    if not fav:
        raise NotFoundError("Favourite", record_id)
    await fav.delete()


@router.get("/schema/apps/{app_id}/{model_slug}/favourites")
async def list_my_favourites(
    app_id: str,
    model_slug: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """List all record IDs the current user has favourited for this model."""
    favs = await RecordFavourite.find(
        RecordFavourite.tenant_id == tenant_id,
        RecordFavourite.app_id == app_id,
        RecordFavourite.model_slug == model_slug,
        RecordFavourite.user_id == str(current_user.id),
    ).to_list()
    return {"record_ids": [f.record_id for f in favs]}
