import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search, FileText, Pencil, Trash2 } from "lucide-react";
import { fmtSmart } from "@/shared/lib/date";

const ACTION_COLORS = {
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const ACTION_ICONS = { create: FileText, update: Pencil, delete: Trash2 };

async function fetchAuditLogs(params) {
  const res = await apiClient.get("/audit-logs", { params });
  return res.data;
}

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ app_id: "", model_slug: "", action: "", user_id: "" });
  const [applied, setApplied] = useState({});
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, applied],
    queryFn: () => fetchAuditLogs({ page, page_size: 50, ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)) }),
  });

  const applyFilters = () => { setApplied({ ...filters }); setPage(1); };
  const clearFilters = () => { setFilters({ app_id: "", model_slug: "", action: "", user_id: "" }); setApplied({}); setPage(1); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Track all record create, update, and delete events.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground mb-1 block">App ID</label>
              <Input placeholder="Filter by app ID" value={filters.app_id} onChange={e => setFilters(f => ({ ...f, app_id: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground mb-1 block">Model slug</label>
              <Input placeholder="Filter by model slug" value={filters.model_slug} onChange={e => setFilters(f => ({ ...f, model_slug: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="w-36">
              <label className="text-xs text-muted-foreground mb-1 block">Action</label>
              <Select value={filters.action || "__all__"} onValueChange={v => setFilters(f => ({ ...f, action: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground mb-1 block">User ID</label>
              <Input placeholder="Filter by user ID" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8" onClick={applyFilters}><Search className="h-3.5 w-3.5 mr-1" />Apply</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={clearFilters}>Clear</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {data ? `${data.total.toLocaleString()} events` : "Events"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data?.items?.length ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No audit events found.</div>
          ) : (
            <div className="divide-y">
              {data.items.map((log) => {
                const Icon = ACTION_ICONS[log.action] || FileText;
                const isOpen = expanded === log.id;
                const changedFields = Object.keys(log.changes || {});
                const { label, title } = fmtSmart(log.created_at);
                return (
                  <div key={log.id} className="px-4 py-3 hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(isOpen ? null : log.id)}>
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground"}`}>
                        {log.action}
                      </span>
                      <span className="text-sm font-mono text-muted-foreground truncate">{log.model_slug} / {log.record_id.slice(-8)}</span>
                      {changedFields.length > 0 && (
                        <span className="text-xs text-muted-foreground">{changedFields.length} field{changedFields.length !== 1 ? "s" : ""} changed</span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground shrink-0" title={title}>{label}</span>
                    </div>
                    {isOpen && log.changes && Object.keys(log.changes).length > 0 && (
                      <div className="mt-3 ml-7 space-y-1">
                        {Object.entries(log.changes).map(([field, diff]) => (
                          <div key={field} className="text-xs font-mono bg-muted rounded px-2 py-1 flex gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{field}:</span>
                            {diff.from !== undefined && <span className="text-red-500 line-through">{JSON.stringify(diff.from)}</span>}
                            {diff.to !== undefined && <span className="text-emerald-600">{JSON.stringify(diff.to)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {Math.ceil(data.total / 50)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!data.has_more} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
