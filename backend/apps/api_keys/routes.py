from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status

from apps.api_keys.models import ApiKey
from apps.api_keys.schemas import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyResponse, ApiKeyUpdate
from apps.api_keys.service import create_api_key
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import ForbiddenError, NotFoundError

router = APIRouter()


def _to_response(k: ApiKey) -> ApiKeyResponse:
    return ApiKeyResponse(
        id=str(k.id),
        tenant_id=k.tenant_id,
        user_id=k.user_id,
        name=k.name,
        key_prefix=k.key_prefix,
        scopes=k.scopes,
        expires_at=k.expires_at,
        last_used_at=k.last_used_at,
        is_active=k.is_active,
        created_at=k.created_at,
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    keys = await ApiKey.find(
        ApiKey.tenant_id == tenant_id,
        ApiKey.user_id == str(current_user.id),
    ).sort(-ApiKey.created_at).to_list()
    return [_to_response(k) for k in keys]


@router.post("/api-keys", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_key_endpoint(
    payload: ApiKeyCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    api_key, raw_key = await create_api_key(
        tenant_id=tenant_id,
        user_id=str(current_user.id),
        name=payload.name,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
    )
    resp = _to_response(api_key)
    return ApiKeyCreatedResponse(**resp.model_dump(), raw_key=raw_key)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(key_id)
    except Exception:
        raise NotFoundError("ApiKey", key_id)
    k = await ApiKey.get(oid)
    if not k or k.tenant_id != tenant_id:
        raise NotFoundError("ApiKey", key_id)
    if k.user_id != str(current_user.id):
        raise ForbiddenError("You can only revoke your own API keys.")
    k.is_active = False
    k.updated_at = datetime.now(tz=timezone.utc)
    await k.save()


@router.patch("/api-keys/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: str,
    payload: ApiKeyUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Update API key name and/or scopes."""
    try:
        oid = PydanticObjectId(key_id)
    except Exception:
        raise NotFoundError("ApiKey", key_id)
    k = await ApiKey.get(oid)
    if not k or k.tenant_id != tenant_id:
        raise NotFoundError("ApiKey", key_id)
    if k.user_id != str(current_user.id) and not current_user.is_superuser:
        raise ForbiddenError("You can only update your own API keys.")
    if payload.name is not None:
        k.name = payload.name
    if payload.scopes is not None:
        k.scopes = payload.scopes
    k.updated_at = datetime.now(tz=timezone.utc)
    await k.save()
    return _to_response(k)


@router.patch("/api-keys/{key_id}/toggle", response_model=ApiKeyResponse)
async def toggle_api_key(
    key_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Enable or disable an API key without deleting it."""
    try:
        oid = PydanticObjectId(key_id)
    except Exception:
        raise NotFoundError("ApiKey", key_id)
    k = await ApiKey.get(oid)
    if not k or k.tenant_id != tenant_id:
        raise NotFoundError("ApiKey", key_id)
    if k.user_id != str(current_user.id):
        raise ForbiddenError("You can only manage your own API keys.")
    k.is_active = not k.is_active
    k.updated_at = datetime.now(tz=timezone.utc)
    await k.save()
    return _to_response(k)
