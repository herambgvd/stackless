from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from apps.ai_builder import service
from apps.ai_builder.schemas import (
    AIConfigCreate,
    AIConfigResponse,
    ChatRequest,
    ChatSessionResponse,
    GenerateRequest,
    GenerateResponse,
    SessionListItem,
)
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import NotFoundError

router = APIRouter()


# ─── AI Config ────────────────────────────────────────────────────────────────

@router.put("/config", response_model=AIConfigResponse)
async def upsert_config(
    payload: AIConfigCreate,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    """Save or update the tenant's AI provider configuration."""
    return await service.save_ai_config(payload, tenant_id)


@router.get("/config", response_model=AIConfigResponse)
async def get_config(tenant_id: str = Depends(get_tenant_id)):
    """Return the tenant's current AI config (API key masked)."""
    cfg = await service.get_ai_config(tenant_id)
    if not cfg:
        raise NotFoundError("AIConfig", tenant_id)
    return cfg


# ─── Chat Sessions ─────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[SessionListItem])
async def list_sessions(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    return await service.list_user_sessions(tenant_id, str(current_user.id))


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    return await service.get_session_detail(session_id, tenant_id, user_id=str(current_user.id))


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    from apps.ai_builder.repository import delete_session as _del
    await _del(session_id, tenant_id, user_id=str(current_user.id))


# ─── Chat (streaming SSE) ─────────────────────────────────────────────────────

@router.post("/chat")
async def chat(
    payload: ChatRequest,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """
    Stream LLM response tokens as Server-Sent Events.

    SSE event shapes:
      {"type": "token",    "content": "..."}
      {"type": "done",     "session_id": "...", "status": "active"|"blueprint_ready", "blueprint"?: {...}}
      {"type": "error",    "message": "..."}
    """
    generator = service.chat_stream(
        session_id=payload.session_id,
        user_message=payload.message,
        tenant_id=tenant_id,
        user_id=str(current_user.id),
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─── Generate (materialise blueprint → real app) ──────────────────────────────

@router.post("/generate", response_model=GenerateResponse)
async def generate_app(
    payload: GenerateRequest,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """
    Parse the blueprint from the given session and create the full app
    (AppDefinition + ModelDefinitions) in Stackless.
    """
    return await service.materialise_blueprint(
        session_id=payload.session_id,
        tenant_id=tenant_id,
        user_id=str(current_user.id),
    )
