from __future__ import annotations

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status

from apps.comments.models import Comment
from apps.comments.schemas import CommentCreate, CommentResponse, CommentUpdate, ActivityEntry
from apps.audit.models import AuditLog
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import ForbiddenError, NotFoundError

router = APIRouter()


def _to_response(c: Comment) -> CommentResponse:
    return CommentResponse(
        id=str(c.id),
        record_id=c.record_id,
        user_id=c.user_id,
        content=c.content,
        mentions=c.mentions or [],
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get(
    "/apps/{app_id}/{model_slug}/records/{record_id}/comments",
    response_model=list[CommentResponse],
)
async def list_comments(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    comments = await Comment.find(
        Comment.record_id == record_id,
        Comment.tenant_id == tenant_id,
        Comment.is_deleted == False,
    ).sort(Comment.created_at).to_list()
    return [_to_response(c) for c in comments]


@router.post(
    "/apps/{app_id}/{model_slug}/records/{record_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    app_id: str,
    model_slug: str,
    record_id: str,
    payload: CommentCreate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    mentions = [uid for uid in (payload.mentions or []) if uid != str(current_user.id)]
    comment = Comment(
        tenant_id=tenant_id,
        record_id=record_id,
        model_slug=model_slug,
        app_id=app_id,
        user_id=str(current_user.id),
        content=payload.content,
        mentions=mentions,
    )
    await comment.insert()

    # Broadcast real-time push to all viewers of this record
    try:
        from apps.comments.service import broadcast_comment_created
        commenter_display = getattr(current_user, "full_name", None) or str(current_user.id)
        await broadcast_comment_created(comment, author_name=commenter_display)
    except Exception:
        pass  # Never let broadcast errors affect comment creation

    # Fire notifications for each @mention (respects user preferences)
    if mentions:
        from apps.notifications.service import send_notification
        from apps.notifications.models import NotificationChannel
        from apps.notifications.preferences import NotificationPreference
        commenter_name = getattr(current_user, "full_name", None) or str(current_user.id)
        for mentioned_uid in mentions:
            try:
                pref = await NotificationPreference.find_one(
                    NotificationPreference.user_id == mentioned_uid,
                    NotificationPreference.tenant_id == tenant_id,
                )
                send_inapp = pref.inapp_mentions if pref else True
                send_email = pref.email_mentions if pref else False
                if send_inapp:
                    await send_notification(
                        channel=NotificationChannel.IN_APP,
                        recipient=mentioned_uid,
                        template_id=None,
                        notification_context={},
                        tenant_id=tenant_id,
                        subject=f"{commenter_name} mentioned you",
                        body=payload.content[:200],
                    )
                if send_email:
                    await send_notification(
                        channel=NotificationChannel.EMAIL,
                        recipient=mentioned_uid,
                        template_id=None,
                        notification_context={},
                        tenant_id=tenant_id,
                        subject=f"{commenter_name} mentioned you in a comment",
                        body=payload.content[:500],
                    )
            except Exception:
                pass  # never block comment creation over a failed notification

    return _to_response(comment)


@router.patch(
    "/apps/{app_id}/{model_slug}/records/{record_id}/comments/{comment_id}",
    response_model=CommentResponse,
)
async def patch_comment(
    app_id: str,
    model_slug: str,
    record_id: str,
    comment_id: str,
    payload: CommentUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Edit a comment (PATCH). Only the comment author can edit it."""
    try:
        oid = PydanticObjectId(comment_id)
    except Exception:
        raise NotFoundError("Comment", comment_id)
    comment = await Comment.get(oid)
    if not comment or comment.record_id != record_id or comment.tenant_id != tenant_id:
        raise NotFoundError("Comment", comment_id)
    if comment.user_id != str(current_user.id):
        raise ForbiddenError("You can only edit your own comments.")
    comment.content = payload.content.strip()
    comment.updated_at = datetime.now(tz=timezone.utc)
    await comment.save()
    return _to_response(comment)


@router.put(
    "/apps/{app_id}/{model_slug}/records/{record_id}/comments/{comment_id}",
    response_model=CommentResponse,
)
async def update_comment(
    app_id: str,
    model_slug: str,
    record_id: str,
    comment_id: str,
    payload: CommentUpdate,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(comment_id)
    except Exception:
        raise NotFoundError("Comment", comment_id)
    comment = await Comment.get(oid)
    if not comment or comment.record_id != record_id or comment.tenant_id != tenant_id:
        raise NotFoundError("Comment", comment_id)
    if comment.user_id != str(current_user.id):
        raise ForbiddenError("You can only edit your own comments.")
    comment.content = payload.content.strip()
    comment.updated_at = datetime.now(tz=timezone.utc)
    await comment.save()
    return _to_response(comment)


@router.delete(
    "/apps/{app_id}/{model_slug}/records/{record_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    app_id: str,
    model_slug: str,
    record_id: str,
    comment_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    try:
        oid = PydanticObjectId(comment_id)
    except Exception:
        raise NotFoundError("Comment", comment_id)
    comment = await Comment.get(oid)
    if not comment or comment.record_id != record_id or comment.tenant_id != tenant_id:
        raise NotFoundError("Comment", comment_id)
    if comment.user_id != str(current_user.id):
        raise ForbiddenError("You can only delete your own comments.")
    comment.is_deleted = True
    comment.updated_at = datetime.now(tz=timezone.utc)
    await comment.save()


@router.get(
    "/apps/{app_id}/{model_slug}/records/{record_id}/activity",
)
async def get_activity_feed(
    app_id: str,
    model_slug: str,
    record_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Merged timeline of comments + audit events, newest first."""
    comments = await Comment.find(
        Comment.record_id == record_id,
        Comment.tenant_id == tenant_id,
        Comment.is_deleted == False,
    ).to_list()

    audit_logs = await AuditLog.find(
        AuditLog.record_id == record_id,
        AuditLog.tenant_id == tenant_id,
    ).to_list()

    entries = []

    for c in comments:
        entries.append({
            "id": str(c.id),
            "type": "comment",
            "user_id": c.user_id,
            "content": c.content,
            "mentions": c.mentions or [],
            "changes": None,
            "created_at": c.created_at.isoformat().replace("+00:00", "Z"),
        })

    for log in audit_logs:
        entries.append({
            "id": str(log.id),
            "type": log.action,
            "user_id": log.user_id or "system",
            "content": _summarise_changes(log.action, log.changes),
            "changes": log.changes,
            "created_at": log.created_at.isoformat().replace("+00:00", "Z"),
        })

    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return entries[:100]


def _summarise_changes(action: str, changes: dict | None) -> str:
    if action == "create":
        return "created this record"
    if action == "delete":
        return "deleted this record"
    if not changes:
        return "updated this record"
    changed_fields = list(changes.keys())
    if len(changed_fields) == 1:
        f = changed_fields[0]
        old = changes[f].get("old", "—") if isinstance(changes[f], dict) else "—"
        new = changes[f].get("new", "—") if isinstance(changes[f], dict) else changes[f]
        return f"changed {f}: {old} → {new}"
    return f"updated {len(changed_fields)} fields: {', '.join(changed_fields[:3])}{'...' if len(changed_fields) > 3 else ''}"
