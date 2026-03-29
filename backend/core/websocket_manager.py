"""
WebSocket connection manager for real-time updates.
Supports:
- Per-tenant broadcast (document changes, workflow events)
- Per-document locking (optimistic locking via presence)
- Real-time notification push
"""
import json
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
from datetime import datetime, timezone


class ConnectionManager:
    def __init__(self):
        # tenant_id -> set of websockets
        self.tenant_connections: Dict[str, Set[WebSocket]] = {}
        # doc_key -> {"user_id": ..., "ws": ..., "since": ...}
        self.document_locks: Dict[str, dict] = {}

    async def connect(self, ws: WebSocket, tenant_id: str):
        await ws.accept()
        if tenant_id not in self.tenant_connections:
            self.tenant_connections[tenant_id] = set()
        self.tenant_connections[tenant_id].add(ws)

    def disconnect(self, ws: WebSocket, tenant_id: str):
        if tenant_id in self.tenant_connections:
            self.tenant_connections[tenant_id].discard(ws)
        # Release any document locks held by this ws
        keys_to_release = [k for k, v in self.document_locks.items() if v.get("ws") is ws]
        for k in keys_to_release:
            del self.document_locks[k]

    async def broadcast_to_tenant(self, tenant_id: str, event: dict):
        """Broadcast an event to all connections in a tenant."""
        if tenant_id not in self.tenant_connections:
            return
        message = json.dumps(event)
        dead = set()
        for ws in list(self.tenant_connections[tenant_id]):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.tenant_connections[tenant_id].discard(ws)

    def lock_document(self, doc_key: str, user_id: str, user_name: str, ws: WebSocket) -> bool:
        """Try to acquire a document lock. Returns True if acquired."""
        existing = self.document_locks.get(doc_key)
        if existing and existing["user_id"] != user_id:
            return False  # locked by someone else
        self.document_locks[doc_key] = {
            "user_id": user_id,
            "user_name": user_name,
            "ws": ws,
            "since": datetime.now(tz=timezone.utc).isoformat(),
        }
        return True

    def unlock_document(self, doc_key: str, user_id: str):
        existing = self.document_locks.get(doc_key)
        if existing and existing["user_id"] == user_id:
            del self.document_locks[doc_key]
            return True
        return False

    def get_lock(self, doc_key: str) -> dict | None:
        lock = self.document_locks.get(doc_key)
        if lock:
            return {"user_id": lock["user_id"], "user_name": lock["user_name"], "since": lock["since"]}
        return None

    async def broadcast_workflow_update(
        self,
        tenant_id: str,
        run_id: str,
        status: str,
        workflow_id: str,
        step_index: int | None = None,
    ):
        """Broadcast workflow run status change to all tenant connections."""
        await self.broadcast_to_tenant(tenant_id, {
            "type": "workflow_update",
            "run_id": run_id,
            "workflow_id": workflow_id,
            "status": status,
            "step_index": step_index,
        })

    async def broadcast_approval_update(
        self,
        tenant_id: str,
        request_id: str,
        flow_id: str,
        status: str,
        decided_by: str | None = None,
    ):
        """Broadcast approval decision to all tenant connections."""
        await self.broadcast_to_tenant(tenant_id, {
            "type": "approval_update",
            "request_id": request_id,
            "flow_id": flow_id,
            "status": status,
            "decided_by": decided_by,
        })

    async def broadcast_comment_added(
        self,
        tenant_id: str,
        record_id: str,
        app_id: str,
        model_slug: str,
        comment_id: str,
        author_id: str,
        author_name: str,
    ):
        """Broadcast new comment to relevant record viewers."""
        await self.broadcast_to_tenant(tenant_id, {
            "type": "comment_added",
            "record_id": record_id,
            "app_id": app_id,
            "model_slug": model_slug,
            "comment_id": comment_id,
            "author_id": author_id,
            "author_name": author_name,
        })

    async def broadcast_task_assigned(
        self,
        tenant_id: str,
        task_id: str,
        assignee_id: str,
        task_title: str,
        workflow_run_id: str | None = None,
    ):
        """Broadcast task assignment to the assigned user."""
        # Target specific user if possible, otherwise broadcast to tenant
        await self.broadcast_to_tenant(tenant_id, {
            "type": "task_assigned",
            "task_id": task_id,
            "assignee_id": assignee_id,
            "task_title": task_title,
            "workflow_run_id": workflow_run_id,
        })

    async def broadcast_notification(
        self,
        tenant_id: str,
        user_id: str,
        subject: str,
        notification_id: str,
    ):
        """Broadcast new in-app notification to specific user."""
        await self.broadcast_to_tenant(tenant_id, {
            "type": "notification",
            "user_id": user_id,
            "subject": subject,
            "notification_id": notification_id,
        })


ws_manager = ConnectionManager()
