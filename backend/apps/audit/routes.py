from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from apps.audit.models import AuditLog
from core.dependencies import get_current_active_user, get_tenant_id, require_role

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: str
    tenant_id: str
    app_id: str
    model_slug: str
    record_id: str
    action: str
    user_id: Optional[str]
    changes: dict
    snapshot: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/audit-logs", response_model=dict)
async def list_audit_logs(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_role(["admin"])),
    app_id: Optional[str] = Query(None),
    model_slug: Optional[str] = Query(None),
    record_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List audit logs for the tenant, with optional filters."""
    conditions = [AuditLog.tenant_id == tenant_id]
    if app_id:
        conditions.append(AuditLog.app_id == app_id)
    if model_slug:
        conditions.append(AuditLog.model_slug == model_slug)
    if record_id:
        conditions.append(AuditLog.record_id == record_id)
    if action:
        conditions.append(AuditLog.action == action)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)

    skip = (page - 1) * page_size
    query = AuditLog.find(*conditions).sort(-AuditLog.created_at)
    total = await query.count()
    logs = await query.skip(skip).limit(page_size).to_list()

    return {
        "items": [
            AuditLogResponse(
                id=str(log.id),
                tenant_id=log.tenant_id,
                app_id=log.app_id,
                model_slug=log.model_slug,
                record_id=log.record_id,
                action=log.action,
                user_id=log.user_id,
                changes=log.changes,
                snapshot=log.snapshot,
                created_at=log.created_at,
            ).model_dump()
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (skip + len(logs)) < total,
    }


@router.get("/audit-logs/record/{record_id}", response_model=list[AuditLogResponse])
async def get_record_audit_trail(
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Get full audit trail for a specific record."""
    logs = await AuditLog.find(
        AuditLog.tenant_id == tenant_id,
        AuditLog.record_id == record_id,
    ).sort(-AuditLog.created_at).to_list()

    return [
        AuditLogResponse(
            id=str(log.id),
            tenant_id=log.tenant_id,
            app_id=log.app_id,
            model_slug=log.model_slug,
            record_id=log.record_id,
            action=log.action,
            user_id=log.user_id,
            changes=log.changes,
            snapshot=log.snapshot,
            created_at=log.created_at,
        )
        for log in logs
    ]
