from __future__ import annotations

import time

import redis.asyncio as aioredis
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from core.security import verify_access_token

log = structlog.get_logger(__name__)

# Atomic Lua script: INCR the key and set its TTL only on the first increment.
# Both operations execute inside a single Redis transaction, eliminating the
# window during which the key exists but has no TTL.
_LUA_INCR_EXPIRE = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""

# Paths exempt from rate limiting (docs, health, metrics, public forms)
_RATE_LIMIT_EXEMPT_PREFIXES = (
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
    "/health",
    "/metrics",
)

# Singleton Redis client — initialised lazily
_redis_client: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        from core.config import get_settings
        settings = get_settings()
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter backed by Redis.
    Keyed per authenticated user (user_id) or client IP for unauthenticated requests.
    Exempt paths are passed through without counting.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        from core.config import get_settings
        settings = get_settings()

        # Skip exempt paths
        path = request.url.path
        if any(path.startswith(p) for p in _RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        # Determine identifier: prefer user_id from JWT, fall back to IP
        identifier: str = request.client.host if request.client else "unknown"
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            payload = verify_access_token(auth_header[7:])
            if payload and payload.get("sub"):
                identifier = f"user:{payload['sub']}"

        window = settings.RATE_LIMIT_WINDOW_SECONDS
        limit = settings.RATE_LIMIT_REQUESTS
        now = int(time.time())
        window_key = now // window
        redis_key = f"rl:{identifier}:{window_key}"

        try:
            redis = _get_redis()
            count = await redis.eval(_LUA_INCR_EXPIRE, 1, redis_key, str(window * 2))
            if count > limit:
                retry_after = window - (now % window)
                headers = {
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": str(retry_after),
                }
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Rate limit exceeded. Max {limit} requests per {window}s.", "code": "RATE_LIMITED"},
                    headers=headers,
                )
        except Exception as exc:
            # If Redis is unavailable, fail closed — reject request to prevent abuse
            log.error("Rate limiter Redis unavailable — rejecting request", error=str(exc))
            return JSONResponse(
                status_code=503,
                content={"detail": "Service temporarily unavailable. Please try again shortly."},
            )

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security-hardening HTTP response headers to every response.
    CSP allows the frontend origin; adjust `CORS_ORIGINS` to include trusted origins.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        # Content-Security-Policy — allows same-origin + configured CORS origins
        from core.config import get_settings as _get_settings
        settings = _get_settings()
        allowed_origins = " ".join(
            o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()
        )
        response.headers["Content-Security-Policy"] = (
            f"default-src 'self' {allowed_origins}; "
            "script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https:; "
            "frame-src https://www.google.com/recaptcha/; "
            "object-src 'none'; "
            "base-uri 'self';"
        )
        return response


_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = (
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/2fa/verify",
    "/api/v1/auth/csrf-token",
    "/api/v1/portal/",
    "/api/v1/schema/public/",
    "/health",
    "/metrics",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
)


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Validate the X-CSRF-Token header on all state-mutating requests
    (POST / PUT / PATCH / DELETE) for authenticated users.
    Public endpoints and safe methods are exempt.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in _CSRF_SAFE_METHODS:
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in _CSRF_EXEMPT_PATHS):
            return await call_next(request)

        # Only enforce for requests with a Bearer token (authenticated users)
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        payload = verify_access_token(auth_header[7:])
        if not payload:
            return await call_next(request)

        user_id = payload.get("sub")
        if not user_id:
            # Token without a subject cannot be CSRF-validated — treat as invalid
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed.", "code": "CSRF_INVALID"},
            )
        csrf_token = request.headers.get("X-CSRF-Token", "")

        from core.security import verify_csrf_token
        if not verify_csrf_token(csrf_token, user_id):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed.", "code": "CSRF_INVALID"},
            )

        return await call_next(request)


_REQUEST_LOG_SKIP_PREFIXES = (
    "/api/docs", "/api/redoc", "/api/openapi.json", "/health", "/metrics",
)
# Only log 1-in-N requests to avoid flooding (1 = log all, 10 = log 10%)
_REQUEST_LOG_SAMPLE_RATE = 1


class RequestLogMiddleware(BaseHTTPMiddleware):
    """
    Logs HTTP requests to MongoDB for admin observability.
    Sampling rate is controlled by _REQUEST_LOG_SAMPLE_RATE.
    Never raises — failures are silently swallowed to avoid breaking requests.
    """

    _counter = 0

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if any(path.startswith(p) for p in _REQUEST_LOG_SKIP_PREFIXES):
            return await call_next(request)

        RequestLogMiddleware._counter += 1
        should_log = (RequestLogMiddleware._counter % _REQUEST_LOG_SAMPLE_RATE) == 0

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        if should_log:
            try:
                tenant_id: str | None = None
                user_id: str | None = None
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    payload = verify_access_token(auth_header[7:])
                    if payload:
                        tenant_id = payload.get("tenant_id")
                        user_id = payload.get("sub")
                # Fire-and-forget — don't await to avoid slowing responses
                import asyncio
                asyncio.ensure_future(_write_request_log(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    method=request.method,
                    path=path,
                    status_code=response.status_code,
                    duration_ms=round(duration_ms, 2),
                    ip=request.client.host if request.client else None,
                    user_agent=request.headers.get("User-Agent"),
                ))
            except Exception:
                pass

        return response


async def _write_request_log(
    tenant_id, user_id, method, path, status_code, duration_ms, ip, user_agent
):
    try:
        from apps.error_logs.models import RequestLog
        await RequestLog(
            tenant_id=tenant_id,
            user_id=user_id,
            method=method,
            path=path,
            status_code=status_code,
            duration_ms=duration_ms,
            ip=ip,
            user_agent=user_agent,
        ).insert()
    except Exception:
        pass


class TenantContextMiddleware(BaseHTTPMiddleware):
    """
    Extract the tenant_id from:
      1. The JWT 'tenant_id' claim (preferred), or
      2. The X-Tenant-ID request header.

    Sets `request.state.tenant_id` for downstream use.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        tenant_id: str | None = None

        # Try JWT first
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = verify_access_token(token)
            if payload:
                tenant_id = payload.get("tenant_id")

        # Fallback to explicit header
        if not tenant_id:
            tenant_id = request.headers.get("X-Tenant-ID")

        request.state.tenant_id = tenant_id

        with structlog.contextvars.bound_contextvars(tenant_id=tenant_id):
            response = await call_next(request)

        return response
