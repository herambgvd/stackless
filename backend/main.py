from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from core.config import get_settings
from core.database import init_db
from core.exceptions import (
    ConflictError,
    FlowForgeException,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError as FlowForgeValidationError,
)
from core.middleware import CSRFMiddleware, RateLimitMiddleware, RequestLogMiddleware, SecurityHeadersMiddleware, TenantContextMiddleware

from apps.auth.routes import router as auth_router
from apps.tenants.routes import router as tenants_router
from apps.rbac.routes import router as rbac_router
from apps.schema_engine.routes import router as schema_router
from apps.rules_engine.routes import router as rules_router
from apps.approval_engine.routes import router as approvals_router
from apps.workflow_engine.routes import router as workflows_router
from apps.notifications.routes import router as notifications_router
from apps.portal.routes import router as portal_router
from apps.dashboard.routes import router as dashboard_router
from apps.dashboard.widget_routes import router as dashboard_widgets_router
from apps.ai_builder.routes import router as ai_router
from apps.templates.routes import router as templates_router
from apps.comments.routes import router as comments_router
from apps.reports.routes import router as reports_router
from apps.portal.form_routes import router as portal_form_router
from apps.api_keys.routes import router as api_keys_router
from apps.workflow_templates.routes import router as workflow_templates_router
from apps.formula_engine.routes import router as formula_router
from apps.human_tasks.routes import router as human_tasks_router
from apps.integrations.routes import router as integrations_router
from apps.audit.routes import router as audit_router
from apps.inbound_webhooks.routes import router as inbound_webhooks_router, public_router as inbound_webhooks_public_router
from apps.print_formats.routes import router as print_formats_router
from apps.notifications.preferences import router as notification_preferences_router
from apps.schema_engine.tags_routes import router as tags_router
from apps.schema_engine.sharing_routes import router as sharing_router
from apps.schema_engine.favourites_routes import router as favourites_router
from apps.schema_engine.attachments_routes import router as attachments_router
from apps.realtime.routes import router as realtime_router
from apps.scripts.routes import router as scripts_router
from apps.error_logs.routes import router as error_logs_router
from apps.admin.routes import router as admin_jobs_router
from apps.email_campaigns.routes import router as email_campaigns_router
from apps.email_inbox.routes import router as email_inbox_router
from apps.desk_chat.routes import router as desk_chat_router
from apps.calendar.routes import router as calendar_router
from apps.billing.routes import router as billing_router
from apps.usage.routes import router as usage_router
from apps.packages.routes import router as packages_router

log = structlog.get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    # Guard against running with default secrets in production
    if settings.is_production:
        _INSECURE_DEFAULTS = {"change-me-to-a-long-random-secret-key", "change-me-csrf-secret"}
        if settings.SECRET_KEY in _INSECURE_DEFAULTS or settings.CSRF_SECRET in _INSECURE_DEFAULTS:
            raise RuntimeError(
                "SECRET_KEY and CSRF_SECRET must be changed from their defaults before running in production."
            )

    log.info("Starting FlowForge backend", environment=settings.ENVIRONMENT)
    await init_db()
    log.info("Database initialised")
    yield
    log.info("Shutting down FlowForge backend")


def create_application() -> FastAPI:
    app = FastAPI(
        title="FlowForge API",
        description=(
            "FlowForge is a no-code full-stack platform. "
            "Build apps, models, rules, approval flows, and workflows — without writing backend code."
        ),
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # ── Middleware ─────────────────────────────────────────────────────────────
    # Starlette middleware is a LIFO stack: first added = innermost (closest to app).
    # CORSMiddleware must be outermost so it adds CORS headers to ALL responses,
    # including 4xx/5xx errors returned by inner middleware. Add it LAST.
    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(TenantContextMiddleware)
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Prometheus metrics ────────────────────────────────────────────────────
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    # ── Routers ───────────────────────────────────────────────────────────────
    prefix = "/api/v1"
    app.include_router(auth_router, prefix=f"{prefix}/auth", tags=["Auth"])
    app.include_router(tenants_router, prefix=f"{prefix}/tenants", tags=["Tenants"])
    app.include_router(rbac_router, prefix=f"{prefix}/rbac", tags=["RBAC"])
    app.include_router(schema_router, prefix=f"{prefix}/schema", tags=["Schema Engine"])
    app.include_router(rules_router, prefix=f"{prefix}/rules", tags=["Rules Engine"])
    app.include_router(approvals_router, prefix=f"{prefix}/approvals", tags=["Approval Engine"])
    app.include_router(workflows_router, prefix=f"{prefix}/workflows", tags=["Workflow Engine"])
    app.include_router(notifications_router, prefix=f"{prefix}/notifications", tags=["Notifications"])
    app.include_router(portal_router, prefix=f"{prefix}/portal", tags=["Portal"])
    app.include_router(dashboard_router, prefix=f"{prefix}/dashboard", tags=["Dashboard"])
    app.include_router(dashboard_widgets_router, prefix=f"{prefix}/schema", tags=["Dashboard Widgets"])
    app.include_router(ai_router, prefix=f"{prefix}/ai", tags=["AI Builder"])
    app.include_router(templates_router, prefix=f"{prefix}/schema", tags=["Templates"])
    app.include_router(comments_router, prefix=f"{prefix}/schema", tags=["Comments"])
    app.include_router(reports_router, prefix=f"{prefix}/schema", tags=["Scheduled Reports"])
    app.include_router(portal_form_router, prefix=f"{prefix}/schema", tags=["Portal Forms"])
    app.include_router(api_keys_router, prefix=f"{prefix}", tags=["API Keys"])
    app.include_router(workflow_templates_router, prefix=f"{prefix}/schema", tags=["Workflow Templates"])
    app.include_router(formula_router, prefix=prefix, tags=["Formula Engine"])
    app.include_router(human_tasks_router, prefix=prefix, tags=["Human Tasks"])
    app.include_router(integrations_router, prefix=f"{prefix}", tags=["Integrations"])
    app.include_router(audit_router, prefix=f"{prefix}", tags=["Audit Logs"])
    app.include_router(inbound_webhooks_router, prefix=f"{prefix}", tags=["Inbound Webhooks"])
    app.include_router(inbound_webhooks_public_router, prefix=f"{prefix}", tags=["Inbound Webhooks (Public)"])
    app.include_router(print_formats_router, prefix=f"{prefix}/schema", tags=["Print Formats"])
    app.include_router(notification_preferences_router, prefix=f"{prefix}", tags=["Notification Preferences"])
    app.include_router(tags_router, prefix="/api/v1", tags=["Tags"])
    app.include_router(sharing_router, prefix="/api/v1", tags=["Sharing"])
    app.include_router(favourites_router, prefix="/api/v1", tags=["Favourites"])
    app.include_router(attachments_router, prefix="/api/v1", tags=["Attachments"])
    # WebSocket — no prefix as it uses /ws/{tenant_id}
    app.include_router(realtime_router, tags=["Realtime"])
    # Scripts — under /api/v1/schema
    app.include_router(scripts_router, prefix="/api/v1/schema", tags=["Scripts"])
    # Error logs — admin only
    app.include_router(error_logs_router, prefix="/api/v1/admin", tags=["ErrorLogs"])
    # Admin jobs monitor
    app.include_router(admin_jobs_router, prefix="/api/v1/admin", tags=["Admin Jobs"])
    # Email campaigns / bulk mail
    app.include_router(email_campaigns_router, prefix=f"{prefix}/email", tags=["Email Campaigns"])
    # Email IMAP inbox
    app.include_router(email_inbox_router, prefix=f"{prefix}/email", tags=["Email Inbox"])
    # Desk chat
    app.include_router(desk_chat_router, prefix=f"{prefix}/chat", tags=["Desk Chat"])
    # Shared calendar
    app.include_router(calendar_router, prefix=f"{prefix}/calendar", tags=["Calendar"])
    # Billing & subscriptions
    app.include_router(billing_router, prefix=f"{prefix}/billing", tags=["Billing"])
    # Usage metering & analytics
    app.include_router(usage_router, prefix=f"{prefix}/usage", tags=["Usage"])
    # Subscription packages (plan management)
    app.include_router(packages_router, prefix=f"{prefix}/packages", tags=["Packages"])

    # ── Exception handlers ────────────────────────────────────────────────────
    @app.exception_handler(FlowForgeException)
    async def flowforge_exception_handler(request: Request, exc: FlowForgeException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, exc: UnauthorizedError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": exc.detail, "code": exc.code},
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(ForbiddenError)
    async def forbidden_handler(request: Request, exc: ForbiddenError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(FlowForgeValidationError)
    async def validation_handler(request: Request, exc: FlowForgeValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        import traceback as tb
        log.error("Unhandled exception", exc_info=exc, path=request.url.path)
        # Async-safe: log to database without blocking
        try:
            from apps.error_logs.models import ErrorLog
            tenant_id = request.headers.get("X-Tenant-ID") or request.query_params.get("tenant_id")
            tb_str = "".join(tb.format_exception(type(exc), exc, exc.__traceback__))
            await ErrorLog(
                tenant_id=tenant_id,
                path=str(request.url.path),
                method=request.method,
                error_type=type(exc).__name__,
                message=str(exc)[:500],
                traceback=tb_str[:5000],
                status_code=500,
            ).insert()
        except Exception:
            pass  # Never let error logging break the response
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An internal server error occurred.", "code": "INTERNAL_ERROR"},
        )

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["Health"])
    async def health_check() -> dict:
        return {"status": "ok", "timestamp": time.time(), "version": "1.0.0"}

    return app


app = create_application()
