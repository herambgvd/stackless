import { useState } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import { AlertCircle, CheckCircle2, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { fmtSmart } from "@/shared/lib/date";

const errorLogsApi = {
  list: (params = {}) =>
    apiClient.get("/admin/error-logs", { params }).then((r) => r.data),
  resolve: (id) =>
    apiClient.patch(`/admin/error-logs/${id}/resolve`).then((r) => r.data),
  delete: (id) =>
    apiClient.delete(`/admin/error-logs/${id}`),
  clearResolved: () =>
    apiClient.delete("/admin/error-logs"),
};

export function ErrorLogsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [selectedLog, setSelectedLog] = useState(null);
  const [filterResolved, setFilterResolved] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["error-logs", filterResolved],
    queryFn: () => errorLogsApi.list({ resolved: filterResolved, page_size: 100 }),
    staleTime: 30_000,
  });

  const logs = data?.items ?? [];
  const total = data?.total ?? 0;

  const resolveMut = useMutation({
    mutationFn: (id) => errorLogsApi.resolve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["error-logs"] });
      setSelectedLog(null);
      toast.success("Marked as resolved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => errorLogsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["error-logs"] });
      setSelectedLog(null);
      toast.success("Error log deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => errorLogsApi.clearResolved(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["error-logs"] });
      toast.success("Cleared all resolved logs");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" /> Error Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} log{total !== 1 ? "s" : ""} · unhandled server errors captured automatically
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filterResolved ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterResolved(!filterResolved)}
          >
            {filterResolved ? "Show Unresolved" : "Show Resolved"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              if (await confirm({ title: "Clear Resolved Logs", message: "Delete all resolved error logs?", confirmLabel: "Delete All", variant: "destructive" })) clearMut.mutate();
            }}
            disabled={clearMut.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear Resolved
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 border rounded-xl">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/40 mb-3" />
          <p className="font-medium">No error logs</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filterResolved ? "No resolved errors found" : "All clear — no unhandled errors"}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Error</th>
                <th className="text-left px-4 py-3 font-medium">Path</th>
                <th className="text-left px-4 py-3 font-medium">Time</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-destructive">{log.error_type}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">{log.message}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {log.method} {log.path}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {fmtSmart(log.occurred_at).label}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={log.resolved ? "secondary" : "destructive"} className="text-xs">
                      {log.resolved ? "Resolved" : "Open"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                    {!log.resolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => resolveMut.mutate(log.id)}
                        disabled={resolveMut.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (await confirm({ title: "Delete Log", message: "Delete this log entry?", confirmLabel: "Delete", variant: "destructive" })) deleteMut.mutate(log.id);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(v) => !v && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-destructive">{selectedLog?.error_type}</DialogTitle>
              <Badge variant={selectedLog?.resolved ? "secondary" : "destructive"}>
                {selectedLog?.resolved ? "Resolved" : "Open"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {selectedLog?.method} {selectedLog?.path} · {selectedLog?.occurred_at ? fmtSmart(selectedLog.occurred_at).label : ""}
            </p>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Message</p>
                <p className="text-sm">{selectedLog?.message}</p>
              </div>
              {selectedLog?.traceback && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Traceback</p>
                  <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.traceback}
                  </pre>
                </div>
              )}
              {selectedLog?.tenant_id && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Tenant</p>
                  <code className="text-xs">{selectedLog.tenant_id}</code>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
            {!selectedLog?.resolved && (
              <Button
                variant="outline"
                onClick={() => resolveMut.mutate(selectedLog.id)}
                disabled={resolveMut.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Resolved
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedLog(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
