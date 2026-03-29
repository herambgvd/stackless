import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  LayoutGrid,
  GitBranch,
  TrendingUp,
  Search,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { apiClient } from "@/shared/lib/api-client";

// ── Data fetching ─────────────────────────────────────────────────────────────

function usePlatformStats() {
  return useQuery({
    queryKey: ["usage", "platform"],
    queryFn: () => apiClient.get("/usage/platform").then((r) => r.data),
    staleTime: 60_000,
  });
}

function useTenantsUsage() {
  return useQuery({
    queryKey: ["usage", "tenants"],
    queryFn: () => apiClient.get("/usage/tenants?limit=100").then((r) => r.data),
    staleTime: 60_000,
  });
}

// ── Plan badge styling ────────────────────────────────────────────────────────

const PLAN_STYLES = {
  free: "bg-slate-100 text-slate-600",
  starter: "bg-blue-50 text-blue-700",
  growth: "bg-purple-50 text-purple-700",
  business: "bg-purple-50 text-purple-700",
  enterprise: "bg-amber-50 text-amber-700",
};

function PlanBadge({ plan }) {
  const label = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "—";
  const styles = PLAN_STYLES[plan?.toLowerCase()] ?? "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent = "text-blue-600", loading }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start gap-4">
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-slate-50 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        {loading ? (
          <div className="mt-1 h-8 w-20 rounded bg-slate-100 animate-pulse" />
        ) : (
          <p className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
            {value ?? "—"}
          </p>
        )}
        {sub && !loading && (
          <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[200, 80, 60, 60, 60, 100, 70].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-4 rounded bg-slate-100 animate-pulse"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Sort indicator ────────────────────────────────────────────────────────────

function SortIndicator({ column, active, direction }) {
  if (active !== column) {
    return <ChevronDown className="w-3.5 h-3.5 text-slate-300 inline ml-0.5" />;
  }
  return direction === "asc" ? (
    <ChevronUp className="w-3.5 h-3.5 text-blue-600 inline ml-0.5" />
  ) : (
    <ChevronDown className="w-3.5 h-3.5 text-blue-600 inline ml-0.5" />
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

// ── Tenants table ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function TenantsTable({ data, loading }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);

  const rows = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.tenant_name?.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "created_at") {
        av = new Date(av).getTime();
        bv = new Date(bv).getTime();
      }
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function onSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700 whitespace-nowrap";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Table header with search */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">All Organizations</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} tenant${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search organizations…"
            value={search}
            onChange={onSearch}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className={thClass} onClick={() => toggleSort("tenant_name")}>
                Organization
                <SortIndicator column="tenant_name" active={sortKey} direction={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort("plan")}>
                Plan
                <SortIndicator column="plan" active={sortKey} direction={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort("app_count")}>
                Apps
                <SortIndicator column="app_count" active={sortKey} direction={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort("user_count")}>
                Users
                <SortIndicator column="user_count" active={sortKey} direction={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort("workflow_count")}>
                Workflows
                <SortIndicator column="workflow_count" active={sortKey} direction={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort("created_at")}>
                Joined
                <SortIndicator column="created_at" active={sortKey} direction={sortDir} />
              </th>
              <th className={`${thClass} cursor-default`}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : paginated.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">
                      {search ? "No organizations match your search." : "No organizations yet."}
                    </p>
                  </td>
                </tr>
              )
              : paginated.map((row) => (
                <tr
                  key={row.tenant_id}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 leading-tight">
                          {row.tenant_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{row.tenant_slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={row.plan} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums font-medium">
                    {row.app_count}
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums font-medium">
                    {row.user_count}
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums font-medium">
                    {row.workflow_count}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={row.is_active} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 text-xs font-medium rounded-lg transition ${
                    page === pageNum
                      ? "bg-blue-600 text-white border border-blue-600"
                      : "border border-slate-200 text-slate-600 hover:bg-white"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan breakdown inline chart ───────────────────────────────────────────────

function PlanBreakdown({ data, loading }) {
  const breakdown = data?.plan_breakdown ?? [];
  const total = breakdown.reduce((s, p) => s + p.count, 0) || 1;

  const planColors = {
    free: "bg-slate-300",
    starter: "bg-blue-400",
    growth: "bg-purple-400",
    business: "bg-purple-500",
    enterprise: "bg-amber-400",
  };

  if (loading) {
    return (
      <div className="space-y-2 mt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 rounded bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!breakdown.length) {
    return <p className="text-xs text-slate-400 mt-2">No data yet.</p>;
  }

  return (
    <div className="space-y-1.5 mt-2">
      {breakdown.map((p) => (
        <div key={p.plan} className="flex items-center gap-2">
          <span className="w-14 text-xs text-slate-500 capitalize">{p.plan}</span>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${planColors[p.plan] ?? "bg-slate-400"}`}
              style={{ width: `${(p.count / total) * 100}%` }}
            />
          </div>
          <span className="w-6 text-xs text-slate-700 font-medium text-right">
            {p.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function UsageDashboard() {
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: tenants, isLoading: tenantsLoading } = useTenantsUsage();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Usage &amp; Metering
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Platform-wide metrics across all organizations.
          </p>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={Building2}
            label="Total Organizations"
            value={stats?.total_tenants?.toLocaleString()}
            sub={
              stats?.new_tenants_last_30_days != null
                ? `+${stats.new_tenants_last_30_days} this month`
                : undefined
            }
            accent="text-blue-600"
            loading={statsLoading}
          />
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats?.total_users?.toLocaleString()}
            accent="text-violet-600"
            loading={statsLoading}
          />

          {/* Plans breakdown card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-slate-50 text-amber-500">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-500 font-medium">Plans</p>
                <PlanBreakdown data={stats} loading={statsLoading} />
              </div>
            </div>
          </div>

          {/* Coming soon card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-slate-50 text-emerald-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Active This Week</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xl font-bold text-slate-300">—</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500">
                    Coming soon
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Activity tracking planned.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tenants table */}
        <TenantsTable data={tenants} loading={tenantsLoading} />
      </div>
    </div>
  );
}
