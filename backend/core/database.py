from __future__ import annotations

import motor.motor_asyncio
from beanie import init_beanie
from urllib.parse import quote_plus

from core.config import get_settings

settings = get_settings()

_client: motor.motor_asyncio.AsyncIOMotorClient | None = None


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


async def init_db() -> None:
    """Initialise Beanie ODM with all document models."""
    from apps.auth.models import User, RefreshToken
    from apps.tenants.models import Tenant
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

    client = get_motor_client()
    database = client[settings.MONGODB_DB_NAME]

    await init_beanie(
        database=database,
        document_models=[
            User,
            RefreshToken,
            Tenant,
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
        ],
    )


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
