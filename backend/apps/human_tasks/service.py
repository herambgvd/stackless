from __future__ import annotations

import asyncio

from apps.human_tasks.models import HumanTask
from core.websocket_manager import ws_manager


async def broadcast_task_created_or_assigned(task: HumanTask) -> None:
    """
    Fire-and-forget WebSocket broadcast after a HumanTask is created or (re)assigned.

    Sends a ``task_assigned`` event to all tenant connections so that the
    assigned user's UI can refresh the task list in real time.
    Errors are swallowed — a broadcast failure must never affect task operations.
    """
    if not task.assignee_id:
        return  # No specific assignee; nothing meaningful to push
    try:
        asyncio.ensure_future(ws_manager.broadcast_task_assigned(
            tenant_id=task.tenant_id,
            task_id=str(task.id),
            assignee_id=str(task.assignee_id),
            task_title=task.title or "New Task",
            workflow_run_id=str(task.workflow_run_id) if task.workflow_run_id else None,
        ))
    except Exception:
        pass
