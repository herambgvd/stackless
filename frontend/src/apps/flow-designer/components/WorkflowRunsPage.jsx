import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Play,
  XCircle,
  CheckCircle,
  Clock,
  Loader2,
  AlertTriangle,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";
import { workflowApi } from "../api/workflow.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { fmtSmart } from "@/shared/lib/date";

const STATUS_ICON = {
  completed: CheckCircle,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  cancelled: AlertTriangle,
};

export function WorkflowRunsPage() {
  const qc = useQueryClient();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["workflows", "runs"],
    queryFn: () => workflowApi.listRuns(),
  });

  const cancel = useMutation({
    mutationFn: (runId) => workflowApi.cancelRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows", "runs"] });
      toast.success("Run cancelled");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Workflow Runs</h2>
        <p className="text-sm text-muted-foreground">
          Monitor and inspect workflow execution history
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Run ID</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-10 text-muted-foreground"
                >
                  <Play className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No workflow runs yet
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => {
                const Icon = STATUS_ICON[run.status] ?? Clock;
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon
                          className={`h-4 w-4 ${
                            run.status === "completed"
                              ? "text-green-600"
                              : run.status === "failed"
                                ? "text-destructive"
                                : run.status === "running"
                                  ? "text-blue-600 animate-spin"
                                  : "text-muted-foreground"
                          }`}
                        />
                        <Badge
                          variant={
                            run.status === "completed"
                              ? "default"
                              : run.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {run.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/workflows/runs/$runId"
                        params={{ runId: run.id }}
                        className="text-sm font-mono text-primary hover:underline"
                      >
                        {run.id.slice(-8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {run.workflow_id.slice(-8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.trigger_event ?? "manual"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.started_at
                        ? (() => { const { label, title } = fmtSmart(run.started_at); return <span title={title}>{label}</span>; })()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.step_results?.length ?? 0}
                    </TableCell>
                    <TableCell>
                      {(run.status === "running" ||
                        run.status === "pending") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => cancel.mutate(run.id)}
                        >
                          <StopCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
