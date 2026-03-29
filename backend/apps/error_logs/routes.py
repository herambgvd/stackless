from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query, status

from apps.error_logs.models import ErrorLog
from core.dependencies import get_tenant_id, require_permission

router = APIRouter()


@router.get("/error-logs")
async def list_error_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    resolved: Optional[bool] = Query(None),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "read")),
):
    """List error logs (admin only, scoped to caller's tenant)."""
    conditions = [ErrorLog.tenant_id == tenant_id]
    if resolved is not None:
        conditions.append(ErrorLog.resolved == resolved)
    query = ErrorLog.find(*conditions)
    total = await query.count()
    logs = await query.sort(-ErrorLog.occurred_at).skip((page - 1) * page_size).limit(page_size).to_list()
    return {
        "items": [_to_dict(log) for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/error-logs/{log_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_error_log(
    log_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "update")),
):
    """Mark an error log as resolved."""
    try:
        oid = PydanticObjectId(log_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    log = await ErrorLog.get(oid)
    if not log or log.tenant_id != tenant_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    log.resolved = True
    await log.save()
    return _to_dict(log)


@router.delete("/error-logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_error_log(
    log_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "delete")),
):
    try:
        oid = PydanticObjectId(log_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    log = await ErrorLog.get(oid)
    if not log or log.tenant_id != tenant_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    await log.delete()


@router.delete("/error-logs", status_code=status.HTTP_204_NO_CONTENT)
async def clear_resolved_logs(
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(require_permission("admin", "delete")),
):
    """Delete all resolved error logs (scoped to caller's tenant)."""
    await ErrorLog.find(ErrorLog.tenant_id == tenant_id, ErrorLog.resolved == True).delete()  # noqa: E712


def _to_dict(log: ErrorLog) -> dict:
    return {
        "id": str(log.id),
        "tenant_id": log.tenant_id,
        "user_id": log.user_id,
        "path": log.path,
        "method": log.method,
        "error_type": log.error_type,
        "message": log.message,
        "traceback": log.traceback,
        "status_code": log.status_code,
        "resolved": log.resolved,
        "occurred_at": log.occurred_at.isoformat(),
    }
