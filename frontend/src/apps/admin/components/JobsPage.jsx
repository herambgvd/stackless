import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { RefreshCw, Server, Activity, Clock, CheckCircle2, XCircle, AlertCircle, Cpu } from "lucide-react";
import { fmtSmart } from "@/shared/lib/date";

const jobsApi = {
  workers: () => apiClient.get("/admin/jobs/workers").then((r) => r.data),
  runs: (params) => apiClient.get("/admin/jobs/runs", { params }).then((r) => r.data),
  beatSchedule: () => apiClient.get("/admin/jobs/beat-schedule").then((r) => r.data),
};

const STATUS_CONFIG = {
  completed: { label: "Completed", variant: "secondary", icon: CheckCircle2, color: "text-green-500" },
  running:   { label: "Running",   variant: "default",   icon: Activity,     color: "text-blue-500" },
  pending:   { label: "Pending",   variant: "outline",   icon: Clock,        color: "text-yellow-500" },
  failed:    { label: "Failed",    variant: "destructive", icon: XCircle,    color: "text-destructive" },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle,     color: "text-muted-foreground" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "outline" };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {Icon && <Icon className={`h-3 w-3 ${cfg.color}`} />}
      {cfg.label}
    </Badge>
  );
}

function WorkerCard({ worker }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{worker.name}</span>
          <Badge variant="secondary" className="text-xs text-green-600 bg-green-100 dark:bg-green-900/20">
            Online
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {worker.concurrency && <span>{worker.concurrency} workers</span>}
          {worker.pid && <span>PID {worker.pid}</span>}
          {worker.broker && <span className="capitalize">{worker.broker}</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
          <p className="text-lg font-bold text-blue-500">{worker.active_count}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
          <p className="text-lg font-bold text-yellow-500">{worker.reserved_count}</p>
          <p className="text-xs text-muted-foreground">Reserved</p>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
          <p className="text-lg font-bold text-muted-foreground">{worker.scheduled_count}</p>
          <p className="text-xs text-muted-foreground">Scheduled</p>
        </div>
      </div>

      {worker.active_tasks.length > 0 && (
        <div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "▾" : "▸"} {worker.active_tasks.length} active task{worker.active_tasks.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {worker.active_tasks.map((t) => (
                <div key={t.id} className="bg-muted/50 rounded px-2 py-1.5 flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground truncate max-w-xs">{t.full_name}</span>
                  <span className="text-muted-foreground shrink-0 ml-2 font-mono">{t.id?.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {worker.total_tasks && Object.keys(worker.total_tasks).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            Task totals
          </summary>
          <div className="mt-1 space-y-0.5 font-mono">
            {Object.entries(worker.total_tasks).map(([name, count]) => (
              <div key={name} className="flex justify-between text-muted-foreground">
                <span className="truncate">{name.split(".").pop()}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function JobsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [hoursFilter, setHoursFilter] = useState("24");

  const workersQ = useQuery({
    queryKey: ["admin-jobs-workers"],
    queryFn: jobsApi.workers,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const runsQ = useQuery({
    queryKey: ["admin-jobs-runs", statusFilter, hoursFilter],
    queryFn: () =>
      jobsApi.runs({
        status: statusFilter === "all" ? undefined : statusFilter,
        hours: parseInt(hoursFilter, 10),
        page_size: 100,
      }),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const beatQ = useQuery({
    queryKey: ["admin-jobs-beat"],
    queryFn: jobsApi.beatSchedule,
    staleTime: 60_000,
  });

  const workers = workersQ.data?.workers ?? [];
  const runs = runsQ.data?.items ?? [];
  const total = runsQ.data?.total ?? 0;
  const beatSchedule = beatQ.data?.schedule ?? {};

  const refetchAll = () => {
    workersQ.refetch();
    runsQ.refetch();
    beatQ.refetch();
  };
  const isFetching = workersQ.isFetching || runsQ.isFetching;

  // Derive status counts from runs
  const counts = runs.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="h-6 w-6 text-muted-foreground" /> Background Jobs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Celery workers, task queue status, and workflow run history
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Workers section */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Workers
        </h2>
        {workersQ.isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading workers…</div>
        ) : workersQ.data?.error ? (
          <div className="border rounded-xl p-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive/40 mb-2" />
            <p className="text-sm text-destructive">Could not reach Celery workers</p>
            <p className="text-xs text-muted-foreground mt-1">{workersQ.data.error}</p>
          </div>
        ) : workers.length === 0 ? (
          <div className="border rounded-xl p-6 text-center">
            <Server className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No workers online</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {workers.map((w) => (
              <WorkerCard key={w.name} worker={w} />
            ))}
          </div>
        )}
      </section>

      {/* Beat schedule */}
      {Object.keys(beatSchedule).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Periodic Tasks (Beat Schedule)
          </h2>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Task</th>
                  <th className="text-left px-4 py-2.5 font-medium">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(beatSchedule).map(([name, entry]) => (
                  <tr key={name} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{entry.task?.split(".").pop()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{entry.schedule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Workflow runs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            Workflow Runs
          </h2>
          <div className="flex items-center gap-2">
            {/* Status summary pills */}
            <div className="flex gap-1.5 mr-2">
              {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
                const n = counts[s];
                if (!n) return null;
                const Icon = cfg.icon;
                return (
                  <span key={s} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    {n}
                  </span>
                );
              })}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hoursFilter} onValueChange={setHoursFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 1h</SelectItem>
                <SelectItem value="6">Last 6h</SelectItem>
                <SelectItem value="24">Last 24h</SelectItem>
                <SelectItem value="72">Last 3d</SelectItem>
                <SelectItem value="168">Last 7d</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {runsQ.isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading runs…</div>
        ) : runs.length === 0 ? (
          <div className="border rounded-xl text-center py-12">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No workflow runs found</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Run ID</th>
                  <th className="text-left px-4 py-2.5 font-medium">Workflow</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tenant</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Steps</th>
                  <th className="text-left px-4 py-2.5 font-medium">Duration</th>
                  <th className="text-left px-4 py-2.5 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {run.id.slice(-8)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {run.workflow_id.slice(-8)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {run.tenant_id || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {run.step_count}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {run.duration_seconds != null
                        ? run.duration_seconds < 60
                          ? `${run.duration_seconds.toFixed(1)}s`
                          : `${(run.duration_seconds / 60).toFixed(1)}m`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {run.started_at ? fmtSmart(run.started_at).label : fmtSmart(run.created_at).label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
              Showing {runs.length} of {total} runs
            </div>
          </div>
        )}

        {/* Failed run errors */}
        {runs.some((r) => r.status === "failed" && r.error) && (
          <details className="mt-3">
            <summary className="text-xs text-destructive cursor-pointer hover:text-destructive/80">
              {runs.filter((r) => r.status === "failed").length} failed run{runs.filter((r) => r.status === "failed").length !== 1 ? "s" : ""} — click to expand errors
            </summary>
            <div className="mt-2 space-y-2">
              {runs
                .filter((r) => r.status === "failed" && r.error)
                .map((r) => (
                  <div key={r.id} className="border border-destructive/20 rounded-lg px-3 py-2 bg-destructive/5">
                    <p className="text-xs font-mono text-muted-foreground mb-1">Run {r.id.slice(-8)}</p>
                    <pre className="text-xs text-destructive whitespace-pre-wrap">{r.error}</pre>
                  </div>
                ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
