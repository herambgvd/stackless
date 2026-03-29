import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "../api/reports.api";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Download, RefreshCw, BarChart2 } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#f97316"];

function formatCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ReportResultsModal({ appId, report, onClose }) {
  const [runKey, setRunKey] = useState(0);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["report-run", appId, report.id, runKey],
    queryFn: () => reportsApi.run(appId, report.id),
    staleTime: 0,
  });

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? report.columns ?? [];
  const totals = data?.totals ?? {};
  const totalRows = data?.total_rows ?? 0;

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!columns.length || !rows.length) return;
    const header = columns.map((c) => `"${c.label}"`).join(",");
    const body = rows
      .map((row) => columns.map((c) => `"${formatCell(row[c.field])}"`).join(","))
      .join("\n");
    const csvContent = `${header}\n${body}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Chart component ───────────────────────────────────────────────────────
  function renderChart() {
    if (!report.chart_type || !report.chart_x_field || !report.chart_y_field) return null;
    if (!rows.length) return null;

    const chartData = rows.map((r) => ({
      x: formatCell(r[report.chart_x_field]),
      y: Number(r[report.chart_y_field]) || 0,
    }));

    if (report.chart_type === "pie") {
      return (
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="y"
                nameKey="x"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ x }) => x}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (report.chart_type === "line") {
      return (
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="y" stroke={CHART_COLORS[0]} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // default bar
    return (
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="y" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5" />
              {report.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRunKey((k) => k + 1)}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportCsv}
                disabled={!rows.length}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Running report…</div>
          ) : isError ? (
            <div className="text-center py-12 text-destructive">
              Error: {error?.message ?? "Failed to run report"}
            </div>
          ) : (
            <>
              {renderChart()}

              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">
                  {totalRows} row{totalRows !== 1 ? "s" : ""} returned
                  {totalRows >= 1000 ? " (limit 1000)" : ""}
                </span>
              </div>

              {rows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  No data matching the current filters.
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          {columns.map((col) => (
                            <th
                              key={col.field}
                              className="text-left px-3 py-2 font-medium whitespace-nowrap"
                              style={col.width ? { width: col.width } : undefined}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr
                            key={i}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            {columns.map((col) => (
                              <td key={col.field} className="px-3 py-2 whitespace-nowrap">
                                {formatCell(row[col.field])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* Totals row */}
                        {report.show_totals && Object.keys(totals).length > 0 && (
                          <tr className="border-t bg-muted/50 font-semibold">
                            {columns.map((col, i) => (
                              <td key={col.field} className="px-3 py-2 whitespace-nowrap">
                                {i === 0 ? "Totals" : (totals[col.field] != null ? formatCell(totals[col.field]) : "")}
                              </td>
                            ))}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
