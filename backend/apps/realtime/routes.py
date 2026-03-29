from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from core.websocket_manager import ws_manager
from core.security import verify_access_token
import json

router = APIRouter()


async def _get_user_from_token(token: str):
    """Authenticate a WebSocket connection via a raw JWT token string."""
    from apps.auth.repository import get_user_by_id

    payload = verify_access_token(token)
    if payload is None:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await get_user_by_id(user_id)


@router.websocket("/ws/{tenant_id}")
async def websocket_endpoint(
    ws: WebSocket,
    tenant_id: str,
    token: str = Query(...),
):
    """
    Main WebSocket endpoint. Auth via token query param.
    Client sends: {"type": "lock", "doc_key": "apps/app1/orders/rec123"}
    Client sends: {"type": "unlock", "doc_key": "..."}
    Client sends: {"type": "ping"}
    Server pushes: {"type": "doc_changed", "app_id": "...", "model_slug": "...", "record_id": "...", "action": "create|update|delete"}
    Server pushes: {"type": "notification", ...}
    Server pushes: {"type": "lock_status", "doc_key": "...", "locked_by": {...}|null}
    """
    try:
        user = await _get_user_from_token(token)
        if not user or str(user.tenant_id) != tenant_id:
            await ws.close(code=4001)
            return
    except Exception:
        await ws.close(code=4001)
        return

    await ws_manager.connect(ws, tenant_id)
    user_id = str(user.id)
    user_name = getattr(user, "full_name", None) or user.email

    try:
        while True:
            data = await ws.receive_text()
            if len(data) > 65_536:  # 64 KB hard cap on incoming frames
                await ws.close(code=1009)
                return
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "lock":
                doc_key = msg.get("doc_key", "")
                acquired = ws_manager.lock_document(doc_key, user_id, user_name, ws)
                await ws.send_text(json.dumps({
                    "type": "lock_ack",
                    "doc_key": doc_key,
                    "acquired": acquired,
                    "locked_by": ws_manager.get_lock(doc_key),
                }))
                # Broadcast lock status to all in tenant
                await ws_manager.broadcast_to_tenant(tenant_id, {
                    "type": "lock_status",
                    "doc_key": doc_key,
                    "locked_by": ws_manager.get_lock(doc_key),
                })

            elif msg_type == "unlock":
                doc_key = msg.get("doc_key", "")
                ws_manager.unlock_document(doc_key, user_id)
                await ws_manager.broadcast_to_tenant(tenant_id, {
                    "type": "lock_status",
                    "doc_key": doc_key,
                    "locked_by": None,
                })

    except WebSocketDisconnect:
        ws_manager.disconnect(ws, tenant_id)
    except Exception:
        ws_manager.disconnect(ws, tenant_id)
