from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any
import re as _re
import traceback
import sys
import io

from fastapi import APIRouter, Depends, Query, UploadFile, File
from pydantic import BaseModel

from core.config import get_settings
from core.dependencies import require_permission

router = APIRouter()


def _get_celery_inspect() -> dict[str, Any]:
    """Query Celery workers via inspect API. Returns safe summary dict."""
    try:
        from celery_worker import celery_app
        inspect = celery_app.control.inspect(timeout=2)

        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}
        stats = inspect.stats() or {}

        workers = []
        all_worker_names = set(active) | set(reserved) | set(stats)
        for worker_name in all_worker_names:
            worker_stats = stats.get(worker_name, {})
            active_tasks = active.get(worker_name, [])
            reserved_tasks = reserved.get(worker_name, [])
            scheduled_tasks = scheduled.get(worker_name, [])
            workers.append({
                "name": worker_name,
                "status": "online",
                "active_count": len(active_tasks),
                "reserved_count": len(reserved_tasks),
                "scheduled_count": len(scheduled_tasks),
                "active_tasks": [
                    {
                        "id": t.get("id"),
                        "name": t.get("name", "").split(".")[-1],
                        "full_name": t.get("name"),
                        "args": t.get("args", []),
                        "kwargs": t.get("kwargs", {}),
                        "time_start": t.get("time_start"),
                        "hostname": t.get("hostname"),
                    }
                    for t in active_tasks[:20]
                ],
                "total_tasks": worker_stats.get("total", {}),
                "concurrency": worker_stats.get("pool", {}).get("max-concurrency"),
                "pid": worker_stats.get("pid"),
                "broker": worker_stats.get("broker", {}).get("transport"),
            })
        return {
            "workers": workers,
            "worker_count": len(workers),
            "error": None,
        }
    except Exception as e:
        return {
            "workers": [],
            "worker_count": 0,
            "error": str(e),
        }


@router.get("/jobs/workers")
async def get_worker_status(
    _=Depends(require_permission("admin", "read")),
):
    """Get Celery worker status and active tasks."""
    return _get_celery_inspect()


@router.get("/jobs/runs")
async def get_recent_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str = Query(None),
    hours: int = Query(24, ge=1, le=168),
    _=Depends(require_permission("admin", "read")),
):
    """Get recent workflow runs across all tenants (admin view)."""
    from apps.workflow_engine.models import WorkflowRun, RunStatus

    since = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    query = WorkflowRun.find(WorkflowRun.created_at >= since)
    if status:
        try:
            query = WorkflowRun.find(
                WorkflowRun.created_at >= since,
                WorkflowRun.status == RunStatus(status),
            )
        except ValueError:
            pass

    total = await query.count()
    runs = await query.sort(-WorkflowRun.created_at).skip((page - 1) * page_size).limit(page_size).to_list()

    return {
        "items": [
            {
                "id": str(r.id),
                "workflow_id": r.workflow_id,
                "tenant_id": r.tenant_id,
                "status": r.status,
                "trigger_event": r.trigger_event,
                "trigger_record_id": r.trigger_record_id,
                "current_step_id": r.current_step_id,
                "step_count": len(r.step_results),
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "created_at": r.created_at.isoformat(),
                "error": r.error,
                "duration_seconds": (
                    (r.completed_at - r.started_at).total_seconds()
                    if r.completed_at and r.started_at else None
                ),
            }
            for r in runs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/jobs/beat-schedule")
async def get_beat_schedule(
    _=Depends(require_permission("admin", "read")),
):
    """Return the configured Celery Beat periodic schedule."""
    try:
        from celery_worker import celery_app
        schedule = {}
        for name, entry in celery_app.conf.beat_schedule.items():
            schedule[name] = {
                "task": entry.get("task"),
                "schedule": str(entry.get("schedule")),
            }
        return {"schedule": schedule, "error": None}
    except Exception as e:
        return {"schedule": {}, "error": str(e)}


# ── System Console ───────────────────────────────────────────────────────────

class ConsoleExecuteRequest(BaseModel):
    code: str
    language: str = "python"


@router.post("/console/execute")
async def execute_console(
    body: ConsoleExecuteRequest,
    user=Depends(require_permission("admin", "create")),
):
    """Execute Python code in the admin system console (superuser only)."""
    if body.language != "python":
        return {"success": False, "output": "", "error": "Only Python is supported.", "result": None}

    # Capture stdout
    stdout_capture = io.StringIO()

    # Build execution context with access to app models
    def _print(*args, **kwargs):
        sep = kwargs.get("sep", " ")
        end = kwargs.get("end", "\n")
        stdout_capture.write(sep.join(str(a) for a in args) + end)

    exec_globals: dict[str, Any] = {
        "__builtins__": {
            "print": _print,
            "len": len, "str": str, "int": int, "float": float, "bool": bool,
            "list": list, "dict": dict, "tuple": tuple, "set": set,
            "range": range, "enumerate": enumerate, "zip": zip, "map": map,
            "filter": filter, "sorted": sorted, "reversed": reversed,
            "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
            "isinstance": isinstance, "issubclass": issubclass, "type": type,
            "hasattr": hasattr, "getattr": getattr, "setattr": setattr,
            "vars": vars, "dir": dir, "repr": repr,
            "True": True, "False": False, "None": None,
            "Exception": Exception, "ValueError": ValueError, "KeyError": KeyError,
            "__import__": __import__,
        },
        # Expose commonly-used app models
        "AppDefinition": None,
        "Workflow": None,
        "WorkflowRun": None,
        "User": None,
        "_user": user,
    }

    # Lazily resolve models to avoid circular import issues
    try:
        from apps.schema_engine.models import AppDefinition
        from apps.workflow_engine.models import Workflow, WorkflowRun
        from apps.auth.models import User
        exec_globals["AppDefinition"] = AppDefinition
        exec_globals["Workflow"] = Workflow
        exec_globals["WorkflowRun"] = WorkflowRun
        exec_globals["User"] = User
    except Exception:
        pass

    exec_locals: dict[str, Any] = {}

    try:
        compiled = compile(body.code, "<console>", "exec")
        exec(compiled, exec_globals, exec_locals)
        output = stdout_capture.getvalue()
        # Surface the last expression value if available
        result = exec_locals.get("_result", None)
        return {
            "success": True,
            "output": output,
            "error": None,
            "result": repr(result) if result is not None else None,
        }
    except Exception:
        output = stdout_capture.getvalue()
        tb = traceback.format_exc()
        return {
            "success": False,
            "output": output,
            "error": tb,
            "result": None,
        }


# ── File Manager ─────────────────────────────────────────────────────────────

@router.get("/files")
async def list_all_files(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    app_id: str = Query(None),
    model_slug: str = Query(None),
    current_user=Depends(require_permission("admin", "read")),
):
    """List all file attachments for the tenant (admin file manager)."""
    from apps.schema_engine.attachments_routes import RecordAttachment

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    if not tenant_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    filters = {"tenant_id": tenant_id}
    if app_id:
        filters["app_id"] = app_id
    if model_slug:
        filters["model_slug"] = model_slug

    query = RecordAttachment.find(filters)
    if search:
        query = RecordAttachment.find({**filters, "filename": {"$regex": _re.escape(search), "$options": "i"}})

    total = await query.count()
    items = await query.sort(-RecordAttachment.uploaded_at).skip((page - 1) * page_size).limit(page_size).to_list()

    return {
        "items": [
            {
                "id": str(a.id),
                "filename": a.filename,
                "content_type": a.content_type,
                "size": a.size,
                "app_id": a.app_id,
                "model_slug": a.model_slug,
                "record_id": a.record_id,
                "uploaded_by": a.uploaded_by,
                "uploaded_at": a.uploaded_at.isoformat(),
                "key": a.key,
            }
            for a in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/files/{file_id}/download-url")
async def get_file_download_url(
    file_id: str,
    current_user=Depends(require_permission("admin", "read")),
):
    """Get a presigned download URL for any file (admin only)."""
    from beanie import PydanticObjectId
    from apps.schema_engine.attachments_routes import RecordAttachment
    from core.storage import get_presigned_url

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    try:
        oid = PydanticObjectId(file_id)
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    attachment = await RecordAttachment.get(oid)
    if not attachment or attachment.tenant_id != tenant_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Not found")

    url = await get_presigned_url(attachment.key, expires=3600)
    return {"url": url, "filename": attachment.filename}


# ── Request Log ──────────────────────────────────────────────────────────────

@router.get("/request-logs")
async def list_request_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    method: str = Query(None),
    status_code: int = Query(None),
    path_contains: str = Query(None),
    hours: int = Query(24, ge=1, le=720),
    current_user=Depends(require_permission("admin", "read")),
):
    """List recent request logs for the admin's tenant."""
    from apps.error_logs.models import RequestLog

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    since = datetime.now(tz=timezone.utc) - timedelta(hours=hours)

    filters: dict = {"requested_at": {"$gte": since}}
    if tenant_id:
        filters["tenant_id"] = tenant_id
    if method:
        filters["method"] = method.upper()
    if status_code:
        filters["status_code"] = status_code
    if path_contains:
        filters["path"] = {"$regex": _re.escape(path_contains), "$options": "i"}

    query = RequestLog.find(filters)
    total = await query.count()
    items = await query.sort(-RequestLog.requested_at).skip((page - 1) * page_size).limit(page_size).to_list()

    return {
        "items": [
            {
                "id": str(r.id),
                "method": r.method,
                "path": r.path,
                "status_code": r.status_code,
                "duration_ms": r.duration_ms,
                "ip": r.ip,
                "user_agent": r.user_agent,
                "user_id": r.user_id,
                "requested_at": r.requested_at.isoformat(),
            }
            for r in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/request-logs", status_code=204)
async def clear_request_logs(
    hours: int = Query(24, ge=1, le=720),
    current_user=Depends(require_permission("admin", "delete")),
):
    """Delete request logs older than `hours` for the current tenant."""
    from apps.error_logs.models import RequestLog

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    filters: dict = {"requested_at": {"$lt": cutoff}}
    if tenant_id:
        filters["tenant_id"] = tenant_id
    await RequestLog.find(filters).delete()


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(
    file_id: str,
    current_user=Depends(require_permission("admin", "delete")),
):
    """Delete a file attachment (admin only)."""
    from beanie import PydanticObjectId
    from apps.schema_engine.attachments_routes import RecordAttachment
    from core.storage import delete_file as storage_delete

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    try:
        oid = PydanticObjectId(file_id)
    except Exception:
        return

    attachment = await RecordAttachment.get(oid)
    if not attachment or attachment.tenant_id != tenant_id:
        return

    try:
        await storage_delete(attachment.key)
    except Exception:
        pass
    await attachment.delete()


# ── Database Backup / Restore ─────────────────────────────────────────────────

@router.post("/backup/create")
async def create_backup(
    _=Depends(require_permission("admin", "create")),
):
    """
    Run mongodump against the configured database and return the archive as a
    gzip-compressed tarball download.  Requires mongodump to be on $PATH.
    """
    import asyncio
    import tempfile
    import os
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    settings = get_settings()
    db_name = settings.MONGODB_DB_NAME
    mongo_uri = settings.MONGODB_URI

    with tempfile.TemporaryDirectory() as tmp:
        archive_path = os.path.join(tmp, f"{db_name}_backup.gz")
        cmd = [
            "mongodump",
            f"--uri={mongo_uri}",
            f"--db={db_name}",
            "--archive=" + archive_path,
            "--gzip",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        if proc.returncode != 0:
            raise HTTPException(500, f"mongodump failed: {stderr.decode()[:500]}")

        # Read archive into memory so we can return after temp dir cleanup
        with open(archive_path, "rb") as f:
            data = f.read()

    from fastapi.responses import Response
    filename = f"{db_name}_{datetime.now(tz=timezone.utc).strftime('%Y%m%d_%H%M%S')}.gz"
    return Response(
        content=data,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/backup/restore")
async def restore_backup(
    file: UploadFile = File(...),
    _=Depends(require_permission("admin", "create")),
):
    """
    Accept a mongodump gzip archive and restore it via mongorestore.
    WARNING: this drops and recreates collections. Use with caution.
    """
    import asyncio
    import tempfile
    import os
    from fastapi import HTTPException

    settings = get_settings()
    db_name = settings.MONGODB_DB_NAME
    mongo_uri = settings.MONGODB_URI

    content = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        archive_path = os.path.join(tmp, "restore.gz")
        with open(archive_path, "wb") as f:
            f.write(content)

        cmd = [
            "mongorestore",
            f"--uri={mongo_uri}",
            f"--db={db_name}",
            "--archive=" + archive_path,
            "--gzip",
            "--drop",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
        if proc.returncode != 0:
            raise HTTPException(500, f"mongorestore failed: {stderr.decode()[:500]}")

    return {"success": True, "message": "Database restored successfully."}


# ── Role migration ─────────────────────────────────────────────────────────────

@router.post("/migrate/seed-roles")
async def migrate_seed_roles(
    _=Depends(require_permission("admin", "create")),
):
    """
    Seed / update system roles (Builder, member, etc.) for ALL existing tenants.
    Idempotent — safe to run multiple times. Call this once after deploying role changes.
    """
    from apps.rbac.service import seed_system_roles_all_tenants

    count = await seed_system_roles_all_tenants()
    return {"success": True, "tenants_processed": count}


@router.post("/trigger-digest")
async def trigger_digest(
    frequency: str = "daily",
    _=Depends(require_permission("admin", "create")),
):
    """Manually trigger email digest for users who opted in. Useful for cron jobs."""
    from apps.notifications.digest import send_digests

    count = await send_digests(frequency=frequency)  # type: ignore[arg-type]
    return {"success": True, "emails_queued": count}


@router.post("/trigger-imap-poll")
async def trigger_imap_poll(
    _=Depends(require_permission("admin", "create")),
):
    """Poll all active IMAP inboxes across all tenants."""
    from apps.email_inbox.imap_service import poll_all_active_inboxes

    results = await poll_all_active_inboxes()
    return {"success": True, "results": results}
