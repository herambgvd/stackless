from __future__ import annotations

import motor.motor_asyncio
from beanie import init_beanie
from urllib.parse import quote_plus

from core.config import get_settings

settings = get_settings()

_client: motor.motor_asyncio.AsyncIOMotorClient | None = None

# Cache of tenant databases that have been initialized with Beanie
_initialized_tenant_dbs: set[str] = set()


def _build_mongo_uri() -> str:
    """Return MongoDB URI with RFC 3986 encoded credentials.

    Credentials are taken from separate settings (MONGODB_USERNAME / MONGODB_PASSWORD)
    and injected into the URI with proper percent-encoding so that special
    characters in the password never break the connection string.
    """
    uri = settings.MONGODB_URI
    username = settings.MONGODB_USERNAME
    password = settings.MONGODB_PASSWORD

    if not username:
        return uri

    encoded_user = quote_plus(username)
    encoded_pass = quote_plus(password)

    # Strip any existing credentials from the URI before injecting encoded ones
    # Handles both mongodb:// and mongodb+srv://
    if "://" in uri:
        scheme, rest = uri.split("://", 1)
        # Remove existing user:pass@ if present
        if "@" in rest:
            rest = rest.rsplit("@", 1)[-1]
        return f"{scheme}://{encoded_user}:{encoded_pass}@{rest}"

    return uri


def get_motor_client() -> motor.motor_asyncio.AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = motor.motor_asyncio.AsyncIOMotorClient(
            _build_mongo_uri(),
            serverSelectionTimeoutMS=5000,
        )
    return _client


def get_platform_db_name() -> str:
    """Return the shared platform database name (stores tenants, superadmin users)."""
    return settings.MONGODB_DB_NAME


def get_tenant_db_name(tenant_id: str) -> str:
    """Return the database name for a specific tenant.

    Each tenant gets an isolated database: ``{platform_db}__{tenant_id}``
    This ensures query performance doesn't degrade as tenant count grows.
    """
    if not tenant_id:
        return settings.MONGODB_DB_NAME
    return f"{settings.MONGODB_DB_NAME}__{tenant_id}"


def get_platform_db():
    """Return the shared platform database (tenants, superadmin)."""
    client = get_motor_client()
    return client[get_platform_db_name()]


def get_tenant_db(tenant_id: str):
    """Return the database for a specific tenant.

    Falls back to the platform database if tenant_id is empty/None.
    """
    client = get_motor_client()
    db_name = get_tenant_db_name(tenant_id)
    return client[db_name]


async def _get_tenant_document_models():
    """Return all Beanie document models that are tenant-scoped."""
    from apps.auth.models import User, RefreshToken
    from apps.rbac.models import Role, RoleProfile
    from apps.schema_engine.models import AppDefinition, FileVersion, ModelDefinition, View
    from apps.rules_engine.models import RuleSet
    from apps.approval_engine.models import ApprovalFlow, ApprovalRequest
    from apps.workflow_engine.models import Workflow, WorkflowRun
    from apps.notifications.models import NotificationTemplate, NotificationLog, EmailBounceEvent
    from apps.notifications.preferences import NotificationPreference
    from apps.portal.models import PortalSubmission
    from apps.portal.form_models import PortalForm
    from apps.ai_builder.models import TenantAIConfig, ChatSession as AIChatSession
    from apps.audit.models import AuditLog
    from apps.dashboard.models import DashboardWidget
    from apps.comments.models import Comment
    from apps.reports.models import ScheduledReport, SavedReport
    from apps.api_keys.models import ApiKey
    from apps.human_tasks.models import HumanTask
    from apps.integrations.models import Integration
    from apps.inbound_webhooks.models import InboundWebhook
    from apps.print_formats.models import PrintFormat, LetterHead
    from apps.error_logs.models import ErrorLog, RequestLog
    from apps.schema_engine.tags_routes import RecordTag
    from apps.schema_engine.sharing_routes import RecordShare
    from apps.schema_engine.favourites_routes import RecordFavourite
    from apps.schema_engine.attachments_routes import RecordAttachment
    from apps.scripts.models import ServerScript, ClientScript
    from apps.email_campaigns.models import EmailCampaign, CampaignSendLog
    from apps.email_inbox.models import InboxConfig, InboundEmail
    from apps.desk_chat.models import ChatChannel, ChatMessage
    from apps.calendar.models import CalendarEvent
    from apps.billing.models import Subscription
    from apps.usage.models import TenantUsageSnapshot
    from apps.packages.models import Package

    return [
        User,
        RefreshToken,
        Role,
        RoleProfile,
        AppDefinition,
        ModelDefinition,
        View,
        FileVersion,
        RuleSet,
        ApprovalFlow,
        ApprovalRequest,
        Workflow,
        WorkflowRun,
        NotificationTemplate,
        NotificationLog,
        EmailBounceEvent,
        NotificationPreference,
        PortalSubmission,
        PortalForm,
        TenantAIConfig,
        AIChatSession,
        AuditLog,
        DashboardWidget,
        Comment,
        ScheduledReport,
        SavedReport,
        ApiKey,
        HumanTask,
        Integration,
        InboundWebhook,
        PrintFormat,
        LetterHead,
        ErrorLog,
        RequestLog,
        RecordTag,
        RecordShare,
        RecordFavourite,
        RecordAttachment,
        ServerScript,
        ClientScript,
        EmailCampaign,
        CampaignSendLog,
        InboxConfig,
        InboundEmail,
        ChatChannel,
        ChatMessage,
        CalendarEvent,
        Subscription,
        TenantUsageSnapshot,
        Package,
    ]


async def init_db() -> None:
    """Initialise Beanie ODM with the platform database.

    This sets up Beanie for the shared platform database which stores
    tenants and superadmin users. Tenant-specific databases are initialized
    lazily on first request via ``ensure_tenant_db_initialized()``.
    """
    from apps.tenants.models import Tenant

    client = get_motor_client()
    platform_database = client[get_platform_db_name()]

    # Initialize platform DB with all models (backward compatible)
    # This ensures the default database works for existing single-DB setups
    tenant_models = await _get_tenant_document_models()
    await init_beanie(
        database=platform_database,
        document_models=[Tenant] + tenant_models,
    )


async def ensure_tenant_db_initialized(tenant_id: str) -> None:
    """Ensure a tenant's database has Beanie models initialized.

    Called once per tenant per app lifecycle. Safe to call multiple times.
    """
    if not tenant_id:
        return

    db_name = get_tenant_db_name(tenant_id)
    if db_name in _initialized_tenant_dbs:
        return

    client = get_motor_client()
    tenant_database = client[db_name]

    tenant_models = await _get_tenant_document_models()
    await init_beanie(
        database=tenant_database,
        document_models=tenant_models,
    )
    _initialized_tenant_dbs.add(db_name)


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
    _initialized_tenant_dbs.clear()
