from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from apps.desk_chat.models import ChatChannel, ChatMessage
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import ForbiddenError, NotFoundError

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str
    description: str = ""
    channel_type: str = "public"
    member_ids: list[str] = []


class MessageCreate(BaseModel):
    body: str
    reply_to_id: str | None = None


# ── Channels ──────────────────────────────────────────────────────────────────

@router.get("/channels")
async def list_channels(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    uid = str(current_user.id)
    channels = await ChatChannel.find(ChatChannel.tenant_id == tenant_id).to_list()
    # Return public channels + private/dm where user is a member
    visible = [
        c for c in channels
        if c.channel_type == "public" or uid in c.member_ids
    ]
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "description": c.description,
            "channel_type": c.channel_type,
            "member_ids": c.member_ids,
            "created_at": c.created_at.isoformat(),
        }
        for c in visible
    ]


@router.post("/channels", status_code=status.HTTP_201_CREATED)
async def create_channel(
    payload: ChannelCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    uid = str(current_user.id)
    member_ids = list(set(payload.member_ids + [uid]))
    c = ChatChannel(
        tenant_id=tenant_id,
        name=payload.name.lower().replace(" ", "-"),
        description=payload.description,
        channel_type=payload.channel_type,
        member_ids=member_ids,
        created_by=uid,
    )
    await c.insert()
    return {"id": str(c.id), "name": c.name}


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(channel_id)
    except Exception:
        raise NotFoundError("ChatChannel", channel_id)
    c = await ChatChannel.get(oid)
    if not c or c.tenant_id != tenant_id:
        raise NotFoundError("ChatChannel", channel_id)
    is_admin = current_user.is_superuser or "admin" in (current_user.roles or [])
    if c.created_by != str(current_user.id) and not is_admin:
        raise ForbiddenError("Only the channel creator or an admin can delete this channel.")
    await c.delete()


# ── Messages ──────────────────────────────────────────────────────────────────

@router.get("/channels/{channel_id}/messages")
async def list_messages(
    channel_id: str,
    before: str = Query(None),    # cursor — message ID
    limit: int = Query(50, ge=1, le=200),
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    filters = [
        ChatMessage.channel_id == channel_id,
        ChatMessage.tenant_id == tenant_id,
        ChatMessage.deleted == False,  # noqa: E712
    ]
    if before:
        try:
            before_oid = PydanticObjectId(before)
            ref = await ChatMessage.get(before_oid)
            if ref:
                filters.append(ChatMessage.created_at < ref.created_at)
        except Exception:
            pass

    msgs = await ChatMessage.find(*filters).sort(-ChatMessage.created_at).limit(limit).to_list()
    msgs.reverse()
    return [_msg_to_dict(m) for m in msgs]


@router.post("/channels/{channel_id}/messages", status_code=status.HTTP_201_CREATED)
async def post_message(
    channel_id: str,
    payload: MessageCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    msg = ChatMessage(
        tenant_id=tenant_id,
        channel_id=channel_id,
        user_id=str(current_user.id),
        user_name=current_user.full_name or current_user.email,
        body=payload.body,
        reply_to_id=payload.reply_to_id,
    )
    await msg.insert()

    # Publish to Redis for live delivery
    try:
        import redis.asyncio as aioredis
        from core.config import get_settings
        settings = get_settings()
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis.publish(
            f"chat:{tenant_id}:{channel_id}",
            json.dumps(_msg_to_dict(msg)),
        )
        await redis.aclose()
    except Exception:
        pass  # Redis unavailable — polling still works

    return _msg_to_dict(msg)


@router.patch("/channels/{channel_id}/messages/{message_id}")
async def edit_message(
    channel_id: str,
    message_id: str,
    payload: dict,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(message_id)
    except Exception:
        raise NotFoundError("ChatMessage", message_id)
    msg = await ChatMessage.get(oid)
    if not msg or msg.tenant_id != tenant_id or msg.user_id != str(current_user.id):
        raise NotFoundError("ChatMessage", message_id)
    if "body" in payload:
        msg.body = payload["body"]
        msg.edited = True
        msg.updated_at = datetime.now(tz=timezone.utc)
        await msg.save()
    return _msg_to_dict(msg)


@router.delete("/channels/{channel_id}/messages/{message_id}", status_code=status.HTTP_200_OK)
async def delete_message(
    channel_id: str,
    message_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(message_id)
    except Exception:
        raise NotFoundError("ChatMessage", message_id)
    msg = await ChatMessage.get(oid)
    if not msg or msg.tenant_id != tenant_id:
        raise NotFoundError("ChatMessage", message_id)
    is_admin = current_user.is_superuser or "admin" in (current_user.roles or [])
    if msg.user_id != str(current_user.id) and not is_admin:
        raise ForbiddenError("You can only delete your own messages.")
    msg.deleted = True
    msg.body = ""
    msg.updated_at = datetime.now(tz=timezone.utc)
    await msg.save()
    return {"ok": True}


@router.post("/channels/{channel_id}/messages/{message_id}/react")
async def react_to_message(
    channel_id: str,
    message_id: str,
    payload: dict,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    emoji = payload.get("emoji", "")
    if not emoji:
        from fastapi import HTTPException
        raise HTTPException(400, "emoji required")
    try:
        oid = PydanticObjectId(message_id)
    except Exception:
        raise NotFoundError("ChatMessage", message_id)
    msg = await ChatMessage.get(oid)
    if not msg or msg.tenant_id != tenant_id:
        raise NotFoundError("ChatMessage", message_id)
    uid = str(current_user.id)
    users = msg.reactions.get(emoji, [])
    if uid in users:
        users.remove(uid)
    else:
        users.append(uid)
    msg.reactions[emoji] = users
    await msg.save()
    return {"reactions": msg.reactions}


# ── WebSocket ──────────────────────────────────────────────────────────────────

@router.websocket("/channels/{channel_id}/ws")
async def chat_ws(
    channel_id: str,
    websocket: WebSocket,
    token: str = Query(...),
    tenant_id: str = Query(...),
):
    """WebSocket endpoint for real-time chat. Client must pass ?token=JWT&tenant_id=..."""
    from core.security import verify_access_token

    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    try:
        import redis.asyncio as aioredis
        from core.config import get_settings
        settings = get_settings()
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = redis.pubsub()
        channel_key = f"chat:{tenant_id}:{channel_id}"
        await pubsub.subscribe(channel_key)

        async def _reader():
            try:
                while True:
                    msg = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True), timeout=20
                    )
                    if msg and msg.get("type") == "message":
                        await websocket.send_text(msg["data"])
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
            except Exception:
                pass

        async def _writer():
            try:
                while True:
                    _ = await websocket.receive_text()  # keep alive / client messages
            except WebSocketDisconnect:
                pass

        reader = asyncio.ensure_future(_reader())
        writer = asyncio.ensure_future(_writer())
        done, pending = await asyncio.wait(
            [reader, writer], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

        await pubsub.unsubscribe(channel_key)
        await pubsub.aclose()
        await redis.aclose()
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ── Helper ─────────────────────────────────────────────────────────────────────

def _msg_to_dict(m: ChatMessage) -> dict:
    return {
        "id": str(m.id),
        "channel_id": m.channel_id,
        "user_id": m.user_id,
        "user_name": m.user_name,
        "body": m.body,
        "reply_to_id": m.reply_to_id,
        "reactions": m.reactions,
        "edited": m.edited,
        "deleted": m.deleted,
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat(),
    }
