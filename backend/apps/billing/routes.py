from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import BadRequestError
from core.plan_limits import PLAN_LIMITS

from apps.billing import service as billing_service
from apps.billing.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    PortalRequest,
    PortalResponse,
    SubscriptionOut,
    SubscriptionWithUsage,
)

log = structlog.get_logger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /billing/subscription
# ---------------------------------------------------------------------------

@router.get("/subscription", response_model=SubscriptionWithUsage)
async def get_subscription(
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
) -> SubscriptionWithUsage:
    """Return current subscription status, plan limits, and usage meters."""
    sub = await billing_service.get_subscription(tenant_id)
    usage = await billing_service.get_usage_summary(tenant_id)
    plan_name = sub.plan.value
    plan_limits = PLAN_LIMITS.get(plan_name, PLAN_LIMITS["free"])

    return SubscriptionWithUsage(
        subscription=SubscriptionOut(
            tenant_id=sub.tenant_id,
            plan=sub.plan,
            status=sub.status,
            stripe_customer_id=sub.stripe_customer_id,
            stripe_subscription_id=sub.stripe_subscription_id,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            trial_ends_at=sub.trial_ends_at,
            cancel_at_period_end=sub.cancel_at_period_end,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
        ),
        usage=usage,
        plan_limits=plan_limits,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# POST /billing/checkout/{plan}
# ---------------------------------------------------------------------------

@router.post("/checkout/{plan}", response_model=CheckoutResponse)
async def create_checkout(
    plan: str,
    body: CheckoutRequest,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
) -> CheckoutResponse:
    """Create a Stripe Checkout session for the given plan (starter | growth)."""
    from core.config import get_settings
    cfg = get_settings()
    if not cfg.STRIPE_SECRET_KEY:
        raise BadRequestError(
            "Stripe is not configured on this server. "
            "Contact your administrator to enable billing."
        )

    plan_lower = plan.lower()
    if plan_lower not in ("starter", "growth"):
        raise BadRequestError(
            f"Invalid plan '{plan}'. Choose 'starter' or 'growth'."
        )

    email = getattr(current_user, "email", "") or ""
    name = getattr(current_user, "full_name", "") or ""

    checkout_url = await billing_service.create_checkout_session(
        tenant_id=tenant_id,
        plan=plan_lower,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        user_email=email,
        user_name=name,
    )
    return CheckoutResponse(checkout_url=checkout_url)


# ---------------------------------------------------------------------------
# POST /billing/portal
# ---------------------------------------------------------------------------

@router.post("/portal", response_model=PortalResponse)
async def create_portal(
    body: PortalRequest,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
) -> PortalResponse:
    """Create a Stripe Billing Portal session so the tenant can manage their subscription."""
    from core.config import get_settings
    cfg = get_settings()
    if not cfg.STRIPE_SECRET_KEY:
        raise BadRequestError(
            "Stripe is not configured on this server. "
            "Contact your administrator to enable billing."
        )

    portal_url = await billing_service.create_billing_portal_session(
        tenant_id=tenant_id,
        return_url=body.return_url,
    )
    return PortalResponse(portal_url=portal_url)


# ---------------------------------------------------------------------------
# POST /billing/webhook  (no auth — Stripe calls this directly)
# ---------------------------------------------------------------------------

@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request) -> JSONResponse:
    """Stripe webhook endpoint. Signature is verified inside the service layer."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        await billing_service.handle_stripe_webhook(payload, sig_header)
    except BadRequestError as exc:
        log.warning("Stripe webhook rejected", detail=exc.detail)
        return JSONResponse(status_code=400, content={"detail": exc.detail})
    except Exception as exc:
        log.error("Stripe webhook processing error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Webhook processing failed."},
        )

    return JSONResponse(status_code=200, content={"status": "ok"})
