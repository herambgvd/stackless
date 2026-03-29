from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import stripe

from core.config import get_settings
from core.exceptions import BadRequestError
from core.plan_limits import PLAN_LIMITS, get_plan_limits

from apps.billing.models import Subscription, SubscriptionStatus
from apps.billing.schemas import UsageMeter, UsageSummary
from apps.tenants.models import Tenant, TenantPlan

log = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Stripe client initialisation (lazy — only when a key is configured)
# ---------------------------------------------------------------------------

def _stripe_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def _init_stripe() -> None:
    if not _stripe_configured():
        raise BadRequestError(
            "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment."
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY


# Plan → Stripe price ID mapping
_PLAN_PRICE_IDS: dict[str, str] = {
    "starter": settings.STRIPE_PRICE_STARTER,
    "growth": settings.STRIPE_PRICE_GROWTH,
}

# Plan → display price (USD cents)
_PLAN_PRICES_CENTS: dict[str, int] = {
    "free": 0,
    "starter": 2900,
    "growth": 7900,
    "business": 7900,
    "enterprise": 0,
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _get_or_create_subscription(tenant_id: str) -> Subscription:
    """Return existing Subscription or create a free-plan one."""
    sub = await Subscription.find_one(Subscription.tenant_id == tenant_id)
    if sub is None:
        sub = Subscription(
            tenant_id=tenant_id,
            plan=TenantPlan.FREE,
            status=SubscriptionStatus.ACTIVE,
        )
        await sub.insert()
    return sub


async def _sync_tenant_plan(tenant_id: str, plan: TenantPlan, status: SubscriptionStatus) -> None:
    """Mirror plan + status onto the Tenant document for quick access."""
    tenant = await Tenant.get(tenant_id)
    if tenant:
        tenant.plan = plan
        tenant.subscription_status = status.value
        tenant.updated_at = datetime.now(tz=timezone.utc)
        await tenant.save()


def _plan_from_price_id(price_id: str) -> TenantPlan:
    """Reverse-lookup a TenantPlan from a Stripe price ID."""
    for plan_name, pid in _PLAN_PRICE_IDS.items():
        if pid and pid == price_id:
            if plan_name == "growth":
                return TenantPlan.FREE  # placeholder; replaced below
            # map plan name string → TenantPlan enum
            try:
                return TenantPlan(plan_name)
            except ValueError:
                pass
    return TenantPlan.FREE


def _plan_enum_from_name(name: str) -> TenantPlan:
    try:
        return TenantPlan(name.lower())
    except ValueError:
        return TenantPlan.FREE


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def get_or_create_stripe_customer(tenant_id: str, email: str, name: str) -> str:
    """Return the Stripe customer ID for this tenant, creating one if needed."""
    _init_stripe()

    sub = await _get_or_create_subscription(tenant_id)
    if sub.stripe_customer_id:
        return sub.stripe_customer_id

    customer = stripe.Customer.create(
        email=email,
        name=name,
        metadata={"tenant_id": tenant_id},
    )
    sub.stripe_customer_id = customer.id
    sub.updated_at = datetime.now(tz=timezone.utc)
    await sub.save()

    # Also mirror onto Tenant document
    tenant = await Tenant.get(tenant_id)
    if tenant:
        tenant.stripe_customer_id = customer.id
        tenant.updated_at = datetime.now(tz=timezone.utc)
        await tenant.save()

    return customer.id


async def create_checkout_session(
    tenant_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
    user_email: str = "",
    user_name: str = "",
) -> str:
    """Create a Stripe Checkout session for the given plan.

    Returns the checkout session URL.
    """
    _init_stripe()

    plan_lower = plan.lower()
    price_id = _PLAN_PRICE_IDS.get(plan_lower)
    if not price_id:
        raise BadRequestError(
            f"Plan '{plan}' is not available for checkout. "
            "Valid plans: starter, growth."
        )

    customer_id: Optional[str] = None
    if user_email:
        customer_id = await get_or_create_stripe_customer(tenant_id, user_email, user_name)

    session_params: dict[str, Any] = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"tenant_id": tenant_id, "plan": plan_lower},
        "subscription_data": {
            "metadata": {"tenant_id": tenant_id, "plan": plan_lower},
        },
        "allow_promotion_codes": True,
    }

    if customer_id:
        session_params["customer"] = customer_id
    elif user_email:
        session_params["customer_email"] = user_email

    session = stripe.checkout.Session.create(**session_params)
    return session.url  # type: ignore[return-value]


async def create_billing_portal_session(tenant_id: str, return_url: str) -> str:
    """Create a Stripe Billing Portal session for the tenant.

    Returns the portal session URL.
    """
    _init_stripe()

    sub = await _get_or_create_subscription(tenant_id)
    if not sub.stripe_customer_id:
        raise BadRequestError(
            "No billing account found for this tenant. "
            "Please subscribe to a paid plan first."
        )

    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=return_url,
    )
    return session.url  # type: ignore[return-value]


async def handle_stripe_webhook(payload: bytes, sig_header: str) -> None:
    """Verify and process a Stripe webhook event."""
    _init_stripe()

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as exc:  # type: ignore[attr-defined]
        raise BadRequestError(f"Invalid Stripe webhook signature: {exc}") from exc
    except Exception as exc:
        raise BadRequestError(f"Malformed webhook payload: {exc}") from exc

    event_type: str = event["type"]
    data_object: dict[str, Any] = event["data"]["object"]

    log.info("Stripe webhook received", event_type=event_type, event_id=event["id"])

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(data_object)

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        await _handle_subscription_updated(data_object)

    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(data_object)

    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(data_object)


async def _handle_checkout_completed(session: dict[str, Any]) -> None:
    """Activate subscription after successful checkout."""
    tenant_id: Optional[str] = (session.get("metadata") or {}).get("tenant_id")
    plan_name: Optional[str] = (session.get("metadata") or {}).get("plan")
    customer_id: Optional[str] = session.get("customer")
    stripe_sub_id: Optional[str] = session.get("subscription")

    if not tenant_id:
        log.warning("checkout.session.completed missing tenant_id metadata")
        return

    # Fetch the Stripe subscription to get price info and period dates
    stripe_sub: Optional[dict[str, Any]] = None
    if stripe_sub_id:
        try:
            stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)  # type: ignore[assignment]
        except Exception as exc:
            log.error("Failed to retrieve Stripe subscription", error=str(exc))

    sub = await _get_or_create_subscription(tenant_id)

    if customer_id:
        sub.stripe_customer_id = customer_id
    if stripe_sub_id:
        sub.stripe_subscription_id = stripe_sub_id

    # Derive plan from price ID if available
    plan_enum = TenantPlan.FREE
    if stripe_sub:
        items_data = stripe_sub.get("items", {}).get("data", [])
        if items_data:
            price_id = items_data[0].get("price", {}).get("id", "")
            sub.stripe_price_id = price_id
            # Map price ID → plan
            for pname, pid in _PLAN_PRICE_IDS.items():
                if pid and pid == price_id:
                    plan_enum = _plan_enum_from_name(pname)
                    break
            else:
                if plan_name:
                    plan_enum = _plan_enum_from_name(plan_name)
        ps = stripe_sub.get("current_period_start")
        pe = stripe_sub.get("current_period_end")
        te = stripe_sub.get("trial_end")
        if ps:
            sub.current_period_start = datetime.fromtimestamp(ps, tz=timezone.utc)
        if pe:
            sub.current_period_end = datetime.fromtimestamp(pe, tz=timezone.utc)
        if te:
            sub.trial_ends_at = datetime.fromtimestamp(te, tz=timezone.utc)

        stripe_status = stripe_sub.get("status", "active")
        try:
            sub.status = SubscriptionStatus(stripe_status)
        except ValueError:
            sub.status = SubscriptionStatus.ACTIVE
    else:
        if plan_name:
            plan_enum = _plan_enum_from_name(plan_name)
        sub.status = SubscriptionStatus.ACTIVE

    sub.plan = plan_enum
    sub.updated_at = datetime.now(tz=timezone.utc)
    await sub.save()
    await _sync_tenant_plan(tenant_id, plan_enum, sub.status)
    log.info("Subscription activated", tenant_id=tenant_id, plan=plan_enum.value)


async def _handle_subscription_updated(stripe_sub: dict[str, Any]) -> None:
    """Sync plan/status after Stripe subscription is updated."""
    tenant_id: Optional[str] = (stripe_sub.get("metadata") or {}).get("tenant_id")
    customer_id: Optional[str] = stripe_sub.get("customer")

    if not tenant_id and customer_id:
        # Lookup tenant by customer_id as fallback
        sub_doc = await Subscription.find_one(Subscription.stripe_customer_id == customer_id)
        if sub_doc:
            tenant_id = sub_doc.tenant_id

    if not tenant_id:
        log.warning("subscription.updated — cannot resolve tenant_id")
        return

    sub = await _get_or_create_subscription(tenant_id)

    items_data = stripe_sub.get("items", {}).get("data", [])
    plan_enum = sub.plan
    if items_data:
        price_id = items_data[0].get("price", {}).get("id", "")
        if price_id:
            sub.stripe_price_id = price_id
            for pname, pid in _PLAN_PRICE_IDS.items():
                if pid and pid == price_id:
                    plan_enum = _plan_enum_from_name(pname)
                    break

    stripe_status = stripe_sub.get("status", "active")
    try:
        sub.status = SubscriptionStatus(stripe_status)
    except ValueError:
        sub.status = SubscriptionStatus.ACTIVE

    ps = stripe_sub.get("current_period_start")
    pe = stripe_sub.get("current_period_end")
    te = stripe_sub.get("trial_end")
    if ps:
        sub.current_period_start = datetime.fromtimestamp(ps, tz=timezone.utc)
    if pe:
        sub.current_period_end = datetime.fromtimestamp(pe, tz=timezone.utc)
    if te:
        sub.trial_ends_at = datetime.fromtimestamp(te, tz=timezone.utc)

    cancel_at_end = stripe_sub.get("cancel_at_period_end", False)
    sub.cancel_at_period_end = bool(cancel_at_end)
    sub.stripe_subscription_id = stripe_sub.get("id", sub.stripe_subscription_id)
    sub.plan = plan_enum
    sub.updated_at = datetime.now(tz=timezone.utc)
    await sub.save()
    await _sync_tenant_plan(tenant_id, plan_enum, sub.status)
    log.info("Subscription synced", tenant_id=tenant_id, plan=plan_enum.value, status=sub.status.value)


async def _handle_subscription_deleted(stripe_sub: dict[str, Any]) -> None:
    """Downgrade tenant to free when subscription is canceled/deleted."""
    tenant_id: Optional[str] = (stripe_sub.get("metadata") or {}).get("tenant_id")
    customer_id: Optional[str] = stripe_sub.get("customer")

    if not tenant_id and customer_id:
        sub_doc = await Subscription.find_one(Subscription.stripe_customer_id == customer_id)
        if sub_doc:
            tenant_id = sub_doc.tenant_id

    if not tenant_id:
        log.warning("subscription.deleted — cannot resolve tenant_id")
        return

    sub = await _get_or_create_subscription(tenant_id)
    sub.plan = TenantPlan.FREE
    sub.status = SubscriptionStatus.CANCELED
    sub.stripe_subscription_id = None
    sub.stripe_price_id = None
    sub.current_period_end = None
    sub.cancel_at_period_end = False
    sub.updated_at = datetime.now(tz=timezone.utc)
    await sub.save()
    await _sync_tenant_plan(tenant_id, TenantPlan.FREE, SubscriptionStatus.CANCELED)
    log.info("Subscription canceled — tenant downgraded to free", tenant_id=tenant_id)


async def _handle_payment_failed(invoice: dict[str, Any]) -> None:
    """Mark subscription as past_due when payment fails."""
    customer_id: Optional[str] = invoice.get("customer")
    if not customer_id:
        return

    sub = await Subscription.find_one(Subscription.stripe_customer_id == customer_id)
    if sub:
        sub.status = SubscriptionStatus.PAST_DUE
        sub.updated_at = datetime.now(tz=timezone.utc)
        await sub.save()
        await _sync_tenant_plan(sub.tenant_id, sub.plan, SubscriptionStatus.PAST_DUE)
        log.warning("Payment failed — subscription marked past_due", tenant_id=sub.tenant_id)


async def get_subscription(tenant_id: str) -> Subscription:
    """Return the subscription for a tenant (creates free one if none exists)."""
    return await _get_or_create_subscription(tenant_id)


async def get_usage_summary(tenant_id: str) -> UsageSummary:
    """Return current resource usage counts for the tenant."""
    from apps.schema_engine.models import AppDefinition, ModelDefinition
    from apps.workflow_engine.models import Workflow
    from apps.auth.models import User

    tenant = await Tenant.get(tenant_id)
    plan_name = tenant.plan.value if tenant else "free"
    limits = get_plan_limits(plan_name)

    apps_count = await AppDefinition.find(
        AppDefinition.tenant_id == tenant_id
    ).count()

    # Records: count ModelDefinition documents (proxy for schema-defined models)
    records_count = await ModelDefinition.find(
        ModelDefinition.tenant_id == tenant_id
    ).count()

    workflows_count = await Workflow.find(
        Workflow.tenant_id == tenant_id
    ).count()

    users_count = await User.find(
        User.tenant_id == tenant_id
    ).count()

    # Storage: placeholder — real implementation would query object store
    storage_used_mb = 0

    return UsageSummary(
        apps=UsageMeter(
            resource="apps",
            label="Apps",
            current=apps_count,
            limit=int(limits["max_apps"]),  # type: ignore[arg-type]
        ),
        records=UsageMeter(
            resource="records",
            label="Records",
            current=records_count,
            limit=int(limits["max_records"]),  # type: ignore[arg-type]
        ),
        workflows=UsageMeter(
            resource="workflows",
            label="Workflows",
            current=workflows_count,
            limit=int(limits["max_workflows"]),  # type: ignore[arg-type]
        ),
        users=UsageMeter(
            resource="users",
            label="Team Members",
            current=users_count,
            limit=int(limits["max_users"]),  # type: ignore[arg-type]
        ),
        storage_mb=UsageMeter(
            resource="storage_mb",
            label="Storage",
            current=storage_used_mb,
            limit=int(limits["storage_mb"]),  # type: ignore[arg-type]
        ),
    )
