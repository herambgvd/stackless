from __future__ import annotations

import asyncio

from apps.comments.models import Comment
from core.websocket_manager import ws_manager


async def broadcast_comment_created(comment: Comment, author_name: str) -> None:
    """
    Fire-and-forget WebSocket broadcast after a comment is persisted.

    Called from the comments route after a successful insert so that all
    users currently viewing the same record receive a real-time push.
    Errors are swallowed — a broadcast failure must never affect comment creation.
    """
    try:
        asyncio.ensure_future(ws_manager.broadcast_comment_added(
            tenant_id=comment.tenant_id,
            record_id=comment.record_id,
            app_id=comment.app_id,
            model_slug=comment.model_slug,
            comment_id=str(comment.id),
            author_id=comment.user_id,
            author_name=author_name,
        ))
    except Exception:
        pass
