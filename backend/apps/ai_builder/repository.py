from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from beanie import PydanticObjectId

from apps.ai_builder.models import ChatMessage, ChatSession, TenantAIConfig


# ─── AI Config ────────────────────────────────────────────────────────────────

async def get_ai_config(tenant_id: str) -> Optional[TenantAIConfig]:
    return await TenantAIConfig.find_one(TenantAIConfig.tenant_id == tenant_id)


async def upsert_ai_config(
    tenant_id: str,
    provider: str,
    model_name: str,
    encrypted_api_key: Optional[str],
    ollama_base_url: Optional[str],
) -> TenantAIConfig:
    existing = await get_ai_config(tenant_id)
    now = datetime.now(timezone.utc)
    if existing:
        existing.provider = provider  # type: ignore[assignment]
        existing.model_name = model_name
        existing.encrypted_api_key = encrypted_api_key
        existing.ollama_base_url = ollama_base_url
        existing.updated_at = now
        await existing.save()
        return existing

    config = TenantAIConfig(
        tenant_id=tenant_id,
        provider=provider,  # type: ignore[arg-type]
        model_name=model_name,
        encrypted_api_key=encrypted_api_key,
        ollama_base_url=ollama_base_url,
        created_at=now,
        updated_at=now,
    )
    await config.insert()
    return config


# ─── Chat Sessions ─────────────────────────────────────────────────────────────

async def create_session(tenant_id: str, user_id: str) -> ChatSession:
    now = datetime.now(timezone.utc)
    session = ChatSession(
        tenant_id=tenant_id,
        user_id=user_id,
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=7),
    )
    await session.insert()
    return session


async def get_session(session_id: str, tenant_id: str, user_id: Optional[str] = None) -> Optional[ChatSession]:
    try:
        oid = PydanticObjectId(session_id)
    except Exception:
        return None
    conditions = [ChatSession.id == oid, ChatSession.tenant_id == tenant_id]
    if user_id:
        conditions.append(ChatSession.user_id == user_id)
    return await ChatSession.find_one(*conditions)


async def list_sessions(tenant_id: str, user_id: str, limit: int = 20) -> list[ChatSession]:
    return (
        await ChatSession.find(
            ChatSession.tenant_id == tenant_id,
            ChatSession.user_id == user_id,
        )
        .sort(-ChatSession.updated_at)
        .limit(limit)
        .to_list()
    )


async def append_message(session: ChatSession, role: str, content: str) -> ChatSession:
    now = datetime.now(timezone.utc)
    session.messages.append(ChatMessage(role=role, content=content, created_at=now))  # type: ignore[arg-type]
    session.updated_at = now
    session.expires_at = now + timedelta(days=7)
    await session.save()
    return session


async def set_title(session: ChatSession, title: str) -> ChatSession:
    session.title = title[:80]
    session.updated_at = datetime.now(timezone.utc)
    await session.save()
    return session


async def set_blueprint(session: ChatSession, blueprint: dict) -> ChatSession:
    session.blueprint = blueprint
    session.status = "blueprint_ready"
    session.updated_at = datetime.now(timezone.utc)
    await session.save()
    return session


async def set_materialised(session: ChatSession, app_id: str) -> ChatSession:
    session.app_id = app_id
    session.status = "materialised"
    session.updated_at = datetime.now(timezone.utc)
    await session.save()
    return session


async def set_failed(session: ChatSession) -> ChatSession:
    session.status = "failed"
    session.updated_at = datetime.now(timezone.utc)
    await session.save()
    return session


async def delete_session(session_id: str, tenant_id: str, user_id: Optional[str] = None) -> bool:
    session = await get_session(session_id, tenant_id, user_id=user_id)
    if session:
        await session.delete()
        return True
    return False
