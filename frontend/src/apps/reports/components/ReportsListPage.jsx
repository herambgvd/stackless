import { useState } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportsApi } from "../api/reports.api";
import { Button } from "@/shared/components/ui/button";
import { Plus, Play, Edit2, Trash2, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import ReportBuilderModal from "./ReportBuilderModal";
import ReportResultsModal from "./ReportResultsModal";

export default function ReportsListPage() {
  const confirm = useConfirm();
  const { appId } = useParams({ from: "/_authenticated/apps/$appId/reports" });
  const qc = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editReport, setEditReport] = useState(null);
  const [runReport, setRunReport] = useState(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["saved-reports", appId],
    queryFn: () => reportsApi.list(appId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => reportsApi.delete(appId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-reports", appId] });
      toast.success("Report deleted");
    },
    onError: (err) => toast.error(err.message ?? "Failed to delete report"),
  });

  function openNew() {
    setEditReport(null);
    setBuilderOpen(true);
  }

  function openEdit(r) {
    setEditReport(r);
    setBuilderOpen(true);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6" /> Reports
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build and run custom reports on your data
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> New Report
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 border rounded-xl">
          <BarChart2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium">No reports yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first report to analyze your data
          </p>
          <Button className="mt-4" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Create Report
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Model</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.model_slug}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{r.report_type}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setRunReport(r)}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Run
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (await confirm({ title: "Delete Report", message: `Delete report "${r.name}"?`, confirmLabel: "Delete", variant: "destructive" })) {
                          deleteMutation.mutate(r.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {builderOpen && (
        <ReportBuilderModal
          appId={appId}
          report={editReport}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["saved-reports", appId] });
            setBuilderOpen(false);
          }}
        />
      )}

      {runReport && (
        <ReportResultsModal
          appId={appId}
          report={runReport}
          onClose={() => setRunReport(null)}
        />
      )}
    </div>
  );
}
