import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CreditCard,
  Zap,
  Users,
  Database,
  GitBranch,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  Crown,
  Infinity,
} from "lucide-react";
import { apiClient } from "@/shared/lib/api-client";

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

// Static UI-only metadata per plan slug (colors, icons, descriptions)
// These never change with pricing — pricing comes from the API.
const PLAN_UI = {
  free:       { label: "Free",       color: "bg-slate-100 text-slate-600",   borderColor: "border-slate-200",  headerColor: "bg-slate-50",  badgeColor: "bg-slate-100 text-slate-700",  icon: null },
  starter:    { label: "Starter",    color: "bg-blue-50 text-blue-700",     borderColor: "border-blue-200",   headerColor: "bg-blue-50",   badgeColor: "bg-blue-100 text-blue-700",    icon: <Zap className="w-4 h-4" /> },
  growth:     { label: "Growth",     color: "bg-purple-50 text-purple-700", borderColor: "border-purple-200", headerColor: "bg-purple-50", badgeColor: "bg-purple-100 text-purple-700", icon: <TrendingUp className="w-4 h-4" />, highlighted: true },
  business:   { label: "Growth",     color: "bg-purple-50 text-purple-700", borderColor: "border-purple-200", headerColor: "bg-purple-50", badgeColor: "bg-purple-100 text-purple-700", icon: <TrendingUp className="w-4 h-4" />, highlighted: true },
  enterprise: { label: "Enterprise", color: "bg-amber-50 text-amber-700",   borderColor: "border-amber-200",  headerColor: "bg-amber-50",  badgeColor: "bg-amber-100 text-amber-700",  icon: <Crown className="w-4 h-4" /> },
};

// Fallback static plan meta (used when API is unavailable)
const PLAN_META_FALLBACK = {
  free: {
    label: "Free",
    price: "$0",
    period: "/month",
    color: "bg-slate-100 text-slate-600",
    borderColor: "border-slate-200",
    headerColor: "bg-slate-50",
    badgeColor: "bg-slate-100 text-slate-700",
    icon: null,
    features: ["3 apps", "500 records", "1 workflow", "2 team members", "100 MB storage"],
  },
  starter: {
    label: "Starter",
    price: "$29",
    period: "/month",
    color: "bg-blue-50 text-blue-700",
    borderColor: "border-blue-200",
    headerColor: "bg-blue-50",
    badgeColor: "bg-blue-100 text-blue-700",
    icon: <Zap className="w-4 h-4" />,
    features: ["15 apps", "10,000 records", "10 workflows", "5 team members", "1 GB storage"],
  },
  growth: {
    label: "Growth",
    price: "$79",
    period: "/month",
    color: "bg-purple-50 text-purple-700",
    borderColor: "border-purple-200",
    headerColor: "bg-purple-50",
    badgeColor: "bg-purple-100 text-purple-700",
    icon: <TrendingUp className="w-4 h-4" />,
    features: [
      "Unlimited apps",
      "100,000 records",
      "Unlimited workflows",
      "25 team members",
      "10 GB storage",
      "AI Builder",
    ],
    highlighted: true,
  },
  business: {
    label: "Growth",
    price: "$79",
    period: "/month",
    color: "bg-purple-50 text-purple-700",
    borderColor: "border-purple-200",
    headerColor: "bg-purple-50",
    badgeColor: "bg-purple-100 text-purple-700",
    icon: <TrendingUp className="w-4 h-4" />,
    features: [
      "Unlimited apps",
      "100,000 records",
      "Unlimited workflows",
      "25 team members",
      "10 GB storage",
      "AI Builder",
    ],
    highlighted: true,
  },
  enterprise: {
    label: "Enterprise",
    price: "Custom",
    period: "",
    color: "bg-amber-50 text-amber-700",
    borderColor: "border-amber-200",
    headerColor: "bg-amber-50",
    badgeColor: "bg-amber-100 text-amber-700",
    icon: <Crown className="w-4 h-4" />,
    features: [
      "Unlimited everything",
      "LDAP / SAML SSO",
      "Custom domain",
      "SLA & dedicated support",
      "Audit logs",
      "AI Builder",
    ],
  },
};

const COMPARISON_PLANS = ["free", "starter", "growth", "enterprise"];

const FEATURE_ROWS = [
  { label: "Apps", keys: ["max_apps"] },
  { label: "Records", keys: ["max_records"] },
  { label: "Workflows", keys: ["max_workflows"] },
  { label: "Team Members", keys: ["max_users"] },
  { label: "Storage", keys: ["storage_mb"], unit: "MB" },
  { label: "AI Builder", keys: ["ai_builder"], boolean: true },
];

const COMPARISON_LIMITS_FALLBACK = {
  free:       { max_apps: 3,   max_records: 500,    max_workflows: 1,  max_users: 2,  storage_mb: 100,   ai_builder: false },
  starter:    { max_apps: 15,  max_records: 10000,  max_workflows: 10, max_users: 5,  storage_mb: 1024,  ai_builder: false },
  growth:     { max_apps: -1,  max_records: 100000, max_workflows: -1, max_users: 25, storage_mb: 10240, ai_builder: true  },
  enterprise: { max_apps: -1,  max_records: -1,     max_workflows: -1, max_users: -1, storage_mb: -1,    ai_builder: true  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-slate-100 rounded ${className}`} />;
}

function PlanBadge({ plan, planMeta }) {
  const meta = planMeta[plan] || planMeta.free || PLAN_UI[plan] || PLAN_UI.free;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badgeColor}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function TrialBanner({ trialEndsAt }) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  if (daysLeft <= 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>
        <span className="font-semibold">{daysLeft} day{daysLeft !== 1 ? "s" : ""} left</span> in your trial.
        Upgrade to keep access after your trial ends.
      </span>
    </div>
  );
}

function UsageMeterCard({ meter, color, icon: Icon }) {
  const isUnlimited = meter.limit === -1;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((meter.current / meter.limit) * 100));
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit = !isUnlimited && pct >= 100;

  const barColors = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
    slate: "bg-slate-400",
  };

  const warningColor = isAtLimit
    ? "bg-red-500"
    : isNearLimit
    ? "bg-amber-500"
    : barColors[color] || "bg-blue-500";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${color}-50`}>
            <Icon className={`w-4 h-4 text-${color}-600`} />
          </div>
          <span className="text-sm font-semibold text-slate-800">{meter.label}</span>
        </div>
        {isUnlimited ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Infinity className="w-3.5 h-3.5" />
            Unlimited
          </span>
        ) : (
          <span className={`text-xs font-medium ${isAtLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-slate-500"}`}>
            {meter.current.toLocaleString()} / {meter.limit.toLocaleString()}
          </span>
        )}
      </div>

      {!isUnlimited ? (
        <div className="space-y-1.5">
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${warningColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{pct}% used</span>
            {isNearLimit && !isAtLimit && (
              <span className="text-xs text-amber-600 font-medium">Approaching limit</span>
            )}
            {isAtLimit && (
              <span className="text-xs text-red-600 font-medium">Limit reached</span>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full bg-emerald-50 rounded-full h-1.5">
          <div className="h-1.5 rounded-full bg-emerald-400 w-full" />
        </div>
      )}
    </div>
  );
}

function FeatureValue({ value, isBoolean, unit }) {
  if (isBoolean) {
    return value ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
    ) : (
      <span className="text-slate-300 text-sm">—</span>
    );
  }
  if (value === -1) {
    return <Infinity className="w-4 h-4 text-slate-500 mx-auto" />;
  }
  if (unit === "MB") {
    if (value >= 1024) {
      return <span className="text-sm font-medium text-slate-700">{value / 1024} GB</span>;
    }
    return <span className="text-sm font-medium text-slate-700">{value} MB</span>;
  }
  return <span className="text-sm font-medium text-slate-700">{value.toLocaleString()}</span>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BillingPage() {
  // Show success toast if redirected back from Stripe with ?success=1
  // We use window.location.search as a simple check since useSearch may
  // only cover route-defined search params.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      toast.success("Subscription activated! Welcome to your new plan.");
      // Clean up the query param without a full navigation
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiClient.get("/billing/subscription").then((r) => r.data),
    staleTime: 30_000,
  });

  // Fetch packages from API — fall back to static data if unavailable
  const { data: packagesData } = useQuery({
    queryKey: ["packages"],
    queryFn: () => apiClient.get("/packages", { params: { active_only: true } }).then((r) => r.data),
    staleTime: 60_000,
  });

  // Build PLAN_META from API packages, merging with UI-only static metadata
  const PLAN_META = (() => {
    if (packagesData && packagesData.length > 0) {
      const meta = {};
      packagesData.forEach((pkg) => {
        const ui = PLAN_UI[pkg.slug] || PLAN_UI.free;
        const lim = pkg.limits || {};
        meta[pkg.slug] = {
          ...ui,
          label: ui.label || pkg.name,
          price: pkg.price_monthly === 0 ? "$0" : pkg.price_monthly >= 1000 ? "Custom" : `$${pkg.price_monthly}`,
          period: pkg.price_monthly === 0 || pkg.price_monthly >= 1000 ? "" : "/month",
          features: [
            lim.max_apps === -1 ? "Unlimited apps" : `${lim.max_apps} apps`,
            lim.max_records === -1 ? "Unlimited records" : `${Number(lim.max_records).toLocaleString()} records`,
            lim.max_workflows === -1 ? "Unlimited workflows" : `${lim.max_workflows} workflow${lim.max_workflows !== 1 ? "s" : ""}`,
            lim.max_users === -1 ? "Unlimited team members" : `${lim.max_users} team member${lim.max_users !== 1 ? "s" : ""}`,
            lim.storage_mb === -1 ? "Unlimited storage" : `${lim.storage_mb >= 1024 ? `${lim.storage_mb / 1024} GB` : `${lim.storage_mb} MB`} storage`,
            ...(lim.ai_builder ? ["AI Builder"] : []),
            ...(lim.allow_custom_domain ? ["Custom domain"] : []),
            ...(lim.allow_sso ? ["LDAP / SAML SSO"] : []),
          ],
        };
      });
      return meta;
    }
    return PLAN_META_FALLBACK;
  })();

  // Build COMPARISON_LIMITS from API packages
  const COMPARISON_LIMITS = (() => {
    if (packagesData && packagesData.length > 0) {
      const limits = {};
      packagesData.forEach((pkg) => {
        limits[pkg.slug] = pkg.limits || {};
      });
      return limits;
    }
    return COMPARISON_LIMITS_FALLBACK;
  })();

  const checkout = useMutation({
    mutationFn: (plan) =>
      apiClient
        .post(`/billing/checkout/${plan}`, {
          success_url: `${window.location.origin}/billing?success=1`,
          cancel_url: `${window.location.origin}/billing`,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start checkout. Please try again.");
    },
  });

  const portal = useMutation({
    mutationFn: () =>
      apiClient
        .post("/billing/portal", {
          return_url: `${window.location.origin}/billing`,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      window.location.href = data.portal_url;
    },
    onError: (err) => {
      toast.error(err.message || "Failed to open billing portal.");
    },
  });

  const subscription = data?.subscription;
  const usage = data?.usage;
  const currentPlan = subscription?.plan || "free";
  const currentMeta = PLAN_META[currentPlan] || PLAN_META.free;
  const isPaid = !["free"].includes(currentPlan);
  const isTrialing = subscription?.status === "trialing";
  const isPastDue = subscription?.status === "past_due";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Billing & Plans</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your subscription, usage, and payment details.
          </p>
        </div>

        {/* ── Past-due warning banner ── */}
        {isPastDue && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>
              <span className="font-semibold">Payment overdue.</span> Please update your payment
              method to avoid service interruption.
            </span>
            <button
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
              className="ml-auto flex-shrink-0 text-xs font-medium underline underline-offset-2 hover:text-red-900 transition-colors"
            >
              Update payment →
            </button>
          </div>
        )}

        {/* ── Section 1: Current Plan Card ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b border-slate-100 ${currentMeta.headerColor}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isLoading ? (
                  <Skeleton className="w-20 h-6" />
                ) : (
                  <PlanBadge plan={currentPlan} planMeta={PLAN_META} />
                )}
                {isLoading ? (
                  <Skeleton className="w-32 h-4" />
                ) : (
                  <span className="text-slate-500 text-sm">
                    {subscription?.cancel_at_period_end
                      ? "Cancels at period end"
                      : isTrialing
                      ? "Trial active"
                      : subscription?.status === "active"
                      ? "Active"
                      : subscription?.status || "Active"}
                  </span>
                )}
              </div>
              {!isLoading && (
                <div className="flex items-center gap-2">
                  {isPaid ? (
                    <button
                      onClick={() => portal.mutate()}
                      disabled={portal.isPending}
                      className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-md px-4 py-2 font-medium text-sm transition-colors duration-150 shadow-sm"
                    >
                      {portal.isPending ? (
                        "Opening..."
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Manage Billing
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => checkout.mutate("starter")}
                      disabled={checkout.isPending}
                      className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md px-4 py-2 font-medium text-sm transition-colors duration-150"
                    >
                      {checkout.isPending ? (
                        "Redirecting..."
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          Upgrade Plan
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {isLoading ? (
              <>
                <Skeleton className="w-40 h-9" />
                <Skeleton className="w-64 h-4" />
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900">
                      {currentMeta.price}
                    </span>
                    {currentMeta.period && (
                      <span className="text-slate-400 text-sm">{currentMeta.period}</span>
                    )}
                  </div>
                  {subscription?.current_period_end && (
                    <p className="text-sm text-slate-500 mt-1">
                      {subscription.cancel_at_period_end ? "Access ends" : "Renews"}{" "}
                      {new Date(subscription.current_period_end).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>

                <TrialBanner trialEndsAt={subscription?.trial_ends_at} />
              </>
            )}
          </div>
        </div>

        {/* ── Section 2: Usage Meters ── */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Usage This Period</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UsageMeterCard
                meter={usage?.apps || { resource: "apps", label: "Apps", current: 0, limit: 3 }}
                color="blue"
                icon={Database}
              />
              <UsageMeterCard
                meter={usage?.records || { resource: "records", label: "Records", current: 0, limit: 500 }}
                color="green"
                icon={Database}
              />
              <UsageMeterCard
                meter={usage?.workflows || { resource: "workflows", label: "Workflows", current: 0, limit: 1 }}
                color="purple"
                icon={GitBranch}
              />
              <UsageMeterCard
                meter={usage?.users || { resource: "users", label: "Team Members", current: 0, limit: 2 }}
                color="orange"
                icon={Users}
              />
            </div>
          )}
        </div>

        {/* ── Section 3: Plan Comparison ── */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Compare Plans</h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Plan headers */}
            <div className="grid grid-cols-5 border-b border-slate-100">
              <div className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Feature
              </div>
              {COMPARISON_PLANS.map((plan) => {
                const meta = PLAN_META[plan];
                const isActive = plan === currentPlan || (plan === "growth" && currentPlan === "business");
                return (
                  <div
                    key={plan}
                    className={`px-4 py-4 text-center ${
                      isActive ? "bg-blue-50" : ""
                    } ${meta.highlighted && !isActive ? "bg-slate-50" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badgeColor}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-lg font-bold text-slate-900">{meta.price}</span>
                      {meta.period && (
                        <span className="text-xs text-slate-400">{meta.period}</span>
                      )}
                      {isActive ? (
                        <span className="text-xs text-blue-600 font-medium">Current plan</span>
                      ) : plan !== "free" && plan !== "enterprise" ? (
                        <button
                          onClick={() => checkout.mutate(plan)}
                          disabled={checkout.isPending}
                          className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-0.5"
                        >
                          {isPaid ? "Switch" : "Upgrade"}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : plan === "enterprise" ? (
                        <a
                          href="mailto:sales@stackless.cloud"
                          className="mt-1 text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors"
                        >
                          Contact sales
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feature rows */}
            {FEATURE_ROWS.map((row, idx) => (
              <div
                key={row.label}
                className={`grid grid-cols-5 ${
                  idx < FEATURE_ROWS.length - 1 ? "border-b border-slate-50" : ""
                } hover:bg-slate-50/50 transition-colors`}
              >
                <div className="px-5 py-3.5 text-sm text-slate-600 font-medium">{row.label}</div>
                {COMPARISON_PLANS.map((plan) => {
                  const limits = COMPARISON_LIMITS[plan];
                  const value = limits[row.keys[0]];
                  const isActive =
                    plan === currentPlan || (plan === "growth" && currentPlan === "business");
                  return (
                    <div
                      key={plan}
                      className={`px-4 py-3.5 flex items-center justify-center ${
                        isActive ? "bg-blue-50/60" : ""
                      }`}
                    >
                      <FeatureValue
                        value={value}
                        isBoolean={row.boolean}
                        unit={row.unit}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Invoice History ── */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Invoice History</h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {!isPaid ? (
              <div className="px-6 py-12 text-center">
                <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">
                  No invoices yet. Upgrade to a paid plan to see your billing history.
                </p>
                <button
                  onClick={() => checkout.mutate("starter")}
                  disabled={checkout.isPending}
                  className="mt-4 inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md px-4 py-2 font-medium text-sm transition-colors duration-150"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Upgrade to Starter — $29/mo
                </button>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-4 px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span className="text-right">Invoice</span>
                </div>
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-slate-400">
                    Invoice history is available in the{" "}
                    <button
                      onClick={() => portal.mutate()}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      Stripe billing portal
                    </button>
                    .
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Enterprise CTA ── */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-400">Enterprise</span>
            </div>
            <h3 className="text-lg font-bold text-white">Need more? Let&apos;s talk.</h3>
            <p className="text-sm text-slate-400 mt-1">
              Unlimited everything, LDAP/SAML, custom domain, SLA and dedicated support.
            </p>
          </div>
          <a
            href="mailto:sales@stackless.cloud"
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-md px-5 py-2.5 font-semibold text-sm transition-colors duration-150"
          >
            Contact Sales
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
