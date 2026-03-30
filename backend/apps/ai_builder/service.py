from __future__ import annotations

import json
from typing import AsyncGenerator, Optional

from apps.ai_builder import repository as repo
from apps.ai_builder.crypto import decrypt_api_key, encrypt_api_key
from apps.ai_builder.llm import auto_title, build_llm, extract_blueprint, stream_response
from apps.ai_builder.models import ChatSession, TenantAIConfig
from apps.ai_builder.schemas import (
    AIConfigCreate,
    AIConfigResponse,
    AppBlueprint,
    BlueprintFieldSpec,
    BlueprintModelSpec,
    GenerateResponse,
    SessionListItem,
    ChatSessionResponse,
    ChatMessageSchema,
)
from core.exceptions import NotFoundError, ValidationError


# ─── AI Config ────────────────────────────────────────────────────────────────

async def save_ai_config(payload: AIConfigCreate, tenant_id: str) -> AIConfigResponse:
    if payload.provider in ("openai", "anthropic") and not payload.api_key:
        raise ValidationError(f"api_key is required for provider '{payload.provider}'.")

    encrypted = encrypt_api_key(payload.api_key) if payload.api_key else None
    cfg = await repo.upsert_ai_config(
        tenant_id=tenant_id,
        provider=payload.provider,
        model_name=payload.model_name,
        encrypted_api_key=encrypted,
        ollama_base_url=payload.ollama_base_url,
    )
    return _config_to_response(cfg)


async def get_ai_config(tenant_id: str) -> Optional[AIConfigResponse]:
    cfg = await repo.get_ai_config(tenant_id)
    return _config_to_response(cfg) if cfg else None


def _config_to_response(cfg: TenantAIConfig) -> AIConfigResponse:
    return AIConfigResponse(
        id=str(cfg.id),
        tenant_id=cfg.tenant_id,
        provider=cfg.provider,
        model_name=cfg.model_name,
        has_api_key=bool(cfg.encrypted_api_key),
        ollama_base_url=cfg.ollama_base_url,
        updated_at=cfg.updated_at,
    )


# ─── Chat Streaming ───────────────────────────────────────────────────────────

async def chat_stream(
    session_id: Optional[str],
    user_message: str,
    tenant_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Orchestrate a streaming chat turn. Yields SSE-formatted strings.

    SSE events emitted:
      data: {"type": "token",    "content": "..."}   — one per LLM token
      data: {"type": "done",     "session_id": "...", "status": "active"|"blueprint_ready"}
      data: {"type": "error",    "message": "..."}
    """
    def _sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    # ── Load or create session ─────────────────────────────────────────────────
    if session_id:
        session = await repo.get_session(session_id, tenant_id)
        if not session:
            yield _sse({"type": "error", "message": "Session not found."})
            return
    else:
        session = await repo.create_session(tenant_id, user_id)

    # ── Load AI config ──────────────────────────────────────────────────────────
    cfg = await repo.get_ai_config(tenant_id)
    if not cfg:
        yield _sse({"type": "error", "message": "AI provider not configured. Go to Admin → AI Settings."})
        return

    # ── Build LLM ──────────────────────────────────────────────────────────────
    api_key = decrypt_api_key(cfg.encrypted_api_key) if cfg.encrypted_api_key else ""
    try:
        llm = build_llm(cfg, api_key)
    except ValidationError as exc:
        yield _sse({"type": "error", "message": exc.detail})
        return

    # ── Set title on first message ────────────────────────────────────────────
    if not session.messages:
        await repo.set_title(session, auto_title(user_message))

    # ── Persist user message ───────────────────────────────────────────────────
    session = await repo.append_message(session, "user", user_message)

    # ── Stream LLM response ────────────────────────────────────────────────────
    full_response = ""
    try:
        async for token in stream_response(llm, session.messages[:-1], user_message):
            full_response += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        await repo.set_failed(session)
        yield _sse({"type": "error", "message": f"LLM error: {str(exc)}"})
        return

    # ── Persist assistant message ──────────────────────────────────────────────
    session = await repo.append_message(session, "assistant", full_response)

    # ── Detect blueprint in response ───────────────────────────────────────────
    blueprint = extract_blueprint(full_response)
    if blueprint:
        await repo.set_blueprint(session, blueprint.model_dump())
        yield _sse({
            "type": "done",
            "session_id": str(session.id),
            "status": "blueprint_ready",
            "blueprint": blueprint.model_dump(),
        })
    else:
        yield _sse({
            "type": "done",
            "session_id": str(session.id),
            "status": session.status,
        })


# ─── Session helpers ──────────────────────────────────────────────────────────

async def list_user_sessions(tenant_id: str, user_id: str) -> list[SessionListItem]:
    sessions = await repo.list_sessions(tenant_id, user_id)
    return [
        SessionListItem(
            session_id=str(s.id),
            title=s.title,
            status=s.status,
            message_count=len(s.messages),
            app_id=s.app_id,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


async def get_session_detail(session_id: str, tenant_id: str, user_id: str | None = None) -> ChatSessionResponse:
    session = await repo.get_session(session_id, tenant_id, user_id=user_id)
    if not session:
        raise NotFoundError("ChatSession", session_id)
    return _session_to_response(session)


def _session_to_response(session: ChatSession) -> ChatSessionResponse:
    return ChatSessionResponse(
        session_id=str(session.id),
        title=session.title,
        status=session.status,
        messages=[
            ChatMessageSchema(role=m.role, content=m.content, created_at=m.created_at)
            for m in session.messages
        ],
        blueprint=session.blueprint,
        app_id=session.app_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


# ─── Blueprint materialisation ────────────────────────────────────────────────

async def materialise_blueprint(
    session_id: str,
    tenant_id: str,
    user_id: str,
) -> GenerateResponse:
    """
    Parse the stored blueprint and create the actual app in Stackless
    by calling the existing schema_engine service layer directly.
    """
    session = await repo.get_session(session_id, tenant_id)
    if not session:
        raise NotFoundError("ChatSession", session_id)

    if not session.blueprint:
        raise ValidationError("No blueprint available. Continue the conversation to generate one.")

    blueprint = AppBlueprint.model_validate(session.blueprint)

    # ── Create the app ─────────────────────────────────────────────────────────
    from apps.schema_engine.schemas import AppCreate, ModelCreate, FieldCreate
    from apps.schema_engine.service import create_new_app, create_new_model

    # Ensure unique slug within tenant
    import re, uuid
    safe_slug = re.sub(r"[^a-z0-9-]", "", blueprint.slug.lower().replace("_", "-"))
    if not safe_slug:
        safe_slug = "app"
    # Append short uuid suffix to avoid conflicts
    safe_slug = f"{safe_slug[:40]}-{str(uuid.uuid4())[:8]}"

    app = await create_new_app(
        AppCreate(
            name=blueprint.name,
            slug=safe_slug,
            description=blueprint.description,
            icon=blueprint.icon,
            color=blueprint.color,
        ),
        tenant_id=tenant_id,
        created_by=user_id,
    )
    app_id = str(app.id)

    # ── Create each model ──────────────────────────────────────────────────────
    for m_spec in blueprint.models:
        fields = [
            FieldCreate(
                name=f.name,
                label=f.label,
                type=f.type,
                config=f.config,
                order=f.order,
                is_required=f.is_required,
            )
            for f in m_spec.fields
        ]
        model_slug = re.sub(r"[^a-z0-9_]", "", m_spec.slug.lower())
        await create_new_model(
            app_id=app_id,
            payload=ModelCreate(
                name=m_spec.name,
                slug=model_slug,
                plural_name=m_spec.plural_name,
                icon=m_spec.icon,
                fields=fields,
            ),
            tenant_id=tenant_id,
        )

    # ── Create default Admin and Member roles for the generated app ────────────
    await _create_default_roles_for_app(app_id, tenant_id)

    # ── Mark session as materialised ───────────────────────────────────────────
    await repo.set_materialised(session, app_id)

    return GenerateResponse(
        session_id=session_id,
        app_id=app_id,
        app_name=blueprint.name,
        app_slug=safe_slug,
        blueprint=session.blueprint,
    )


async def _create_default_roles_for_app(app_id: str, tenant_id: str) -> None:
    """Create 'App Admin' and 'App Member' roles with full/read-only permissions
    for every guarded resource in the generated app.  Non-blocking on failure."""
    try:
        from apps.rbac.models import Permission, Role

        resources = ["apps", "models", "records", "workflows", "rules", "approvals"]
        # Make role names unique per app so the (tenant_id, name) unique index doesn't collide
        suffix = app_id[-6:]

        admin_role = Role(
            name=f"App Admin [{suffix}]",
            tenant_id=tenant_id,
            app_id=app_id,
            description="Full access to the generated app (auto-created by AI Builder)",
            permissions=[
                Permission(resource=r, actions=["create", "read", "update", "delete"])
                for r in resources
            ],
        )
        await admin_role.insert()

        member_role = Role(
            name=f"App Member [{suffix}]",
            tenant_id=tenant_id,
            app_id=app_id,
            description="Read and create access (auto-created by AI Builder)",
            permissions=[
                Permission(resource=r, actions=["read", "create"])
                for r in resources
            ],
        )
        await member_role.insert()
    except Exception:
        import structlog
        structlog.get_logger(__name__).warning(
            "Failed to create default roles for generated app", app_id=app_id
        )
