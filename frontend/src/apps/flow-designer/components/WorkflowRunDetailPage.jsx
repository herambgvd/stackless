import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { workflowApi } from "../api/workflow.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { fmtSmart, fmtDateTime } from "@/shared/lib/date";

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle,
    color: "text-green-600",
    bg: "bg-green-500/10",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    label: "Failed",
  },
  running: {
    icon: Loader2,
    color: "text-blue-600",
    bg: "bg-blue-500/10",
    label: "Running",
  },
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    label: "Pending",
  },
  cancelled: {
    icon: AlertTriangle,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "Cancelled",
  },
};

function _durationMs(start, end) {
  if (!start || !end) return null;
  return Math.max(0, new Date(end) - new Date(start));
}

function _fmtDuration(ms) {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function WorkflowRunDetailPage() {
  const { runId } = useParams({
    from: "/_authenticated/workflows/runs/$runId",
  });

  const { data: run, isLoading } = useQuery({
    queryKey: ["workflows", "runs", runId],
    queryFn: () => workflowApi.getRun(runId),
    refetchInterval: (data) => (data?.status === "running" ? 3000 : false),
  });

  const { data: workflow } = useQuery({
    queryKey: ["workflows", run?.workflow_id],
    queryFn: () => workflowApi.getWorkflow(run.workflow_id),
    enabled: !!run?.workflow_id,
  });

  const stepNameMap = Object.fromEntries(
    (workflow?.steps ?? []).map((s) => [s.id, s.name])
  );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!run)
    return <p className="text-sm text-muted-foreground">Run not found</p>;

  const statusCfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/workflows/runs">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Workflow Run
          </h2>
          <p className="text-xs text-muted-foreground font-mono">{run.id}</p>
        </div>
        <Badge
          variant={
            run.status === "completed"
              ? "default"
              : run.status === "failed"
                ? "destructive"
                : "secondary"
          }
        >
          {run.status}
        </Badge>
      </div>

      {/* Run summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Workflow</p>
            <p className="text-sm font-medium mt-1">{run.workflow_id}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Trigger</p>
            <p className="text-sm font-medium mt-1">
              {run.trigger_event ?? "manual"}
            </p>
            {run.trigger_record_id && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Record: {run.trigger_record_id}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Timeline</p>
            <p className="text-sm font-medium mt-1">
              {run.started_at
                ? (() => { const { label, title } = fmtSmart(run.started_at); return <span title={title}>{label}</span>; })()
                : "Not started"}
            </p>
            {run.started_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtDateTime(run.started_at)}
              </p>
            )}
            {run.completed_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Completed {fmtDateTime(run.completed_at)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {run.error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive mb-1">Error</p>
            <p className="text-sm text-destructive/80 font-mono whitespace-pre-wrap">
              {run.error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Execution Trace ({run.step_results?.length ?? 0} steps)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(run.step_results ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No step results yet.
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border" />
              <div className="space-y-3">
                {run.step_results.map((step, i) => {
                  const cfg = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  const stepName = stepNameMap[step.step_id] || step.step_id;
                  const durationMs = _durationMs(step.started_at, step.completed_at);
                  return (
                    <div key={i} className="relative flex gap-3">
                      <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${cfg.bg} border border-border`}>
                        <Icon className={`h-3.5 w-3.5 ${cfg.color} ${step.status === "running" ? "animate-spin" : ""}`} />
                      </div>
                      <div className="flex-1 rounded-lg border border-border p-3 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{stepName}</span>
                          <Badge variant="outline" className="text-xs">{step.status}</Badge>
                          {step.attempt_count > 1 && (
                            <span className="text-xs text-amber-600">Retry #{step.attempt_count}</span>
                          )}
                          {durationMs !== null && (
                            <span className="text-xs text-muted-foreground ml-auto">{_fmtDuration(durationMs)}</span>
                          )}
                        </div>
                        {step.step_id !== stepName && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{step.step_id}</p>
                        )}
                        {step.error && (
                          <p className="text-xs text-destructive font-mono mt-2 p-2 bg-destructive/5 rounded">
                            {step.error}
                          </p>
                        )}
                        {Object.keys(step.output_data ?? {}).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              Output data
                            </summary>
                            <pre className="text-xs mt-1 p-2 rounded bg-muted overflow-x-auto">
                              {JSON.stringify(step.output_data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Variables */}
      {Object.keys(run.variables ?? {}).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Variables</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs p-2 rounded bg-muted overflow-x-auto">
              {JSON.stringify(run.variables, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
