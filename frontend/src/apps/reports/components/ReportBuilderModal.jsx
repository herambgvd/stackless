import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { reportsApi } from "../api/reports.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Separator } from "@/shared/components/ui/separator";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "like", "in", "not in", "is set", "is not set"];
const AGGREGATES = ["", "sum", "avg", "count", "min", "max"];
const CHART_TYPES = ["", "bar", "line", "pie"];
const COL_TYPES = ["data", "currency", "int", "float", "date", "datetime"];

const EMPTY_REPORT = {
  name: "",
  description: "",
  report_type: "query",
  model_slug: "",
  columns: [],
  filters: [],
  sorting: [],
  group_by: "",
  show_totals: false,
  chart_type: "",
  chart_x_field: "",
  chart_y_field: "",
  script: "",
  mongo_pipeline: "",
  is_public: false,
};

export default function ReportBuilderModal({ appId, report, onClose, onSaved }) {
  const isEdit = !!report;
  const [form, setForm] = useState(
    isEdit
      ? {
          ...EMPTY_REPORT,
          ...report,
          chart_type: report.chart_type ?? "",
          chart_x_field: report.chart_x_field ?? "",
          chart_y_field: report.chart_y_field ?? "",
          group_by: report.group_by ?? "",
          script: report.script ?? "",
          mongo_pipeline: report.mongo_pipeline ?? "",
        }
      : { ...EMPTY_REPORT },
  );
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Load all models for this app
  const { data: models = [] } = useQuery({
    queryKey: ["apps", appId, "models"],
    queryFn: () => schemaApi.listModels(appId),
    staleTime: 30_000,
  });

  const selectedModel = models.find((m) => m.slug === form.model_slug);
  const modelFields = selectedModel?.fields ?? [];

  // ── Column helpers ────────────────────────────────────────────────────────
  function addColumn(fieldObj) {
    if (form.columns.some((c) => c.field === fieldObj.name)) return;
    set("columns", [
      ...form.columns,
      { field: fieldObj.name, label: fieldObj.label, type: "data", width: null, aggregate: null },
    ]);
  }

  function removeColumn(i) {
    set("columns", form.columns.filter((_, idx) => idx !== i));
  }

  function updateColumn(i, key, value) {
    const next = form.columns.map((c, idx) =>
      idx === i ? { ...c, [key]: value || null } : c,
    );
    set("columns", next);
  }

  // ── Filter helpers ────────────────────────────────────────────────────────
  function addFilter() {
    set("filters", [...form.filters, { field: "", operator: "=", value: "" }]);
  }

  function removeFilter(i) {
    set("filters", form.filters.filter((_, idx) => idx !== i));
  }

  function updateFilter(i, key, value) {
    const next = form.filters.map((f, idx) => (idx === i ? { ...f, [key]: value } : f));
    set("filters", next);
  }

  // ── Sorting helpers ───────────────────────────────────────────────────────
  function addSorting() {
    set("sorting", [...form.sorting, { field: "", direction: "asc" }]);
  }

  function removeSorting(i) {
    set("sorting", form.sorting.filter((_, idx) => idx !== i));
  }

  function updateSorting(i, key, value) {
    const next = form.sorting.map((s, idx) => (idx === i ? { ...s, [key]: value } : s));
    set("sorting", next);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Report name is required");
      return;
    }
    if (!form.model_slug) {
      toast.error("Please select a model");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        chart_type: form.chart_type || null,
        chart_x_field: form.chart_x_field || null,
        chart_y_field: form.chart_y_field || null,
        group_by: form.group_by || null,
        script: form.script || null,
        mongo_pipeline: form.mongo_pipeline || null,
        columns: form.columns.map((c) => ({ ...c, aggregate: c.aggregate || null })),
      };
      if (isEdit) {
        await reportsApi.update(appId, report.id, payload);
        toast.success("Report updated");
      } else {
        await reportsApi.create(appId, payload);
        toast.success("Report created");
      }
      onSaved();
    } catch (err) {
      toast.error(err.message ?? "Failed to save report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>{isEdit ? "Edit Report" : "New Report"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Report Name *
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="My Report"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Model *
              </Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.model_slug}
                onChange={(e) => set("model_slug", e.target.value)}
              >
                <option value="">— select model —</option>
                {models.map((m) => (
                  <option key={m.id} value={m.slug}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Type
              </Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.report_type}
                onChange={(e) => set("report_type", e.target.value)}
              >
                <option value="query">Query</option>
                <option value="script">Script</option>
                <option value="mongo">Mongo Pipeline</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Description
              </Label>
              <Input
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Group By */}
          {form.model_slug && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Group By
              </Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.group_by ?? ""}
                onChange={(e) => set("group_by", e.target.value || null)}
              >
                <option value="">— No grouping —</option>
                {modelFields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label} ({f.name})
                  </option>
                ))}
              </select>
              {form.group_by && (
                <p className="text-xs text-muted-foreground">
                  Set aggregate functions on columns to compute per-group values.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="show_totals"
              checked={form.show_totals}
              onChange={(e) => set("show_totals", e.target.checked)}
              className="h-4 w-4 rounded border border-input"
            />
            <label htmlFor="show_totals" className="text-sm cursor-pointer">
              Show totals row
            </label>
            <input
              type="checkbox"
              id="is_public"
              checked={form.is_public}
              onChange={(e) => set("is_public", e.target.checked)}
              className="h-4 w-4 rounded border border-input ml-4"
            />
            <label htmlFor="is_public" className="text-sm cursor-pointer">
              Public report
            </label>
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs defaultValue="columns">
            <TabsList className="w-full">
              <TabsTrigger value="columns" className="flex-1">
                Columns ({form.columns.length})
              </TabsTrigger>
              <TabsTrigger value="filters" className="flex-1">
                Filters ({form.filters.length})
              </TabsTrigger>
              <TabsTrigger value="sorting" className="flex-1">
                Sorting ({form.sorting.length})
              </TabsTrigger>
              <TabsTrigger value="chart" className="flex-1">
                Chart
              </TabsTrigger>
              {form.report_type === "mongo" && (
                <TabsTrigger value="mongo" className="flex-1">
                  Pipeline
                </TabsTrigger>
              )}
              {form.report_type === "script" && (
                <TabsTrigger value="script" className="flex-1">
                  Script
                </TabsTrigger>
              )}
            </TabsList>

            {/* COLUMNS */}
            <TabsContent value="columns" className="mt-4 space-y-3">
              {form.model_slug ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Available fields — click to add
                    </Label>
                    <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30 min-h-[48px]">
                      {modelFields.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">
                          No fields found for this model
                        </span>
                      )}
                      {modelFields.map((f) => {
                        const added = form.columns.some((c) => c.field === f.name);
                        return (
                          <button
                            key={f.name}
                            type="button"
                            onClick={() => !added && addColumn(f)}
                            disabled={added}
                            className={`rounded px-2 py-0.5 text-xs font-mono transition-colors ${
                              added
                                ? "bg-primary/20 text-primary cursor-default"
                                : "bg-muted hover:bg-primary/10 hover:text-primary cursor-pointer"
                            }`}
                          >
                            {f.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {form.columns.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Selected columns
                      </Label>
                      {form.columns.map((col, i) => (
                        <div
                          key={col.field}
                          className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          <Input
                            value={col.label}
                            onChange={(e) => updateColumn(i, "label", e.target.value)}
                            placeholder="Label"
                            className="flex-1 h-7 text-xs"
                          />
                          <span className="text-xs text-muted-foreground font-mono shrink-0">
                            {col.field}
                          </span>
                          <select
                            className="rounded border border-input bg-background px-1.5 py-1 text-xs h-7"
                            value={col.type}
                            onChange={(e) => updateColumn(i, "type", e.target.value)}
                          >
                            {COL_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <select
                            className="rounded border border-input bg-background px-1.5 py-1 text-xs h-7"
                            value={col.aggregate ?? ""}
                            onChange={(e) => updateColumn(i, "aggregate", e.target.value)}
                          >
                            <option value="">no agg</option>
                            {AGGREGATES.filter(Boolean).map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            value={col.width ?? ""}
                            onChange={(e) =>
                              updateColumn(
                                i,
                                "width",
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            placeholder="width"
                            className="w-16 h-7 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => removeColumn(i)}
                            className="text-destructive hover:text-destructive/70 shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No columns selected. Click fields above to add them.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Select a model first to see available fields.
                </p>
              )}
            </TabsContent>

            {/* FILTERS */}
            <TabsContent value="filters" className="mt-4 space-y-3">
              {form.filters.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs h-8"
                    value={f.field}
                    onChange={(e) => updateFilter(i, "field", e.target.value)}
                  >
                    <option value="">— field —</option>
                    {modelFields.map((mf) => (
                      <option key={mf.name} value={mf.name}>
                        {mf.label} ({mf.name})
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded border border-input bg-background px-2 py-1 text-xs h-8"
                    value={f.operator}
                    onChange={(e) => updateFilter(i, "operator", e.target.value)}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  {!["is set", "is not set"].includes(f.operator) && (
                    <Input
                      value={f.value ?? ""}
                      onChange={(e) => updateFilter(i, "value", e.target.value)}
                      placeholder="value"
                      className="flex-1 h-8 text-xs"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFilter(i)}
                    className="text-destructive hover:text-destructive/70 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addFilter} className="w-full">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Filter
              </Button>
            </TabsContent>

            {/* SORTING */}
            <TabsContent value="sorting" className="mt-4 space-y-3">
              {form.sorting.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs h-8"
                    value={s.field}
                    onChange={(e) => updateSorting(i, "field", e.target.value)}
                  >
                    <option value="">— field —</option>
                    {modelFields.map((mf) => (
                      <option key={mf.name} value={mf.name}>
                        {mf.label} ({mf.name})
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded border border-input bg-background px-2 py-1 text-xs h-8"
                    value={s.direction}
                    onChange={(e) => updateSorting(i, "direction", e.target.value)}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSorting(i)}
                    className="text-destructive hover:text-destructive/70 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addSorting} className="w-full">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Sort
              </Button>
            </TabsContent>

            {/* CHART */}
            <TabsContent value="chart" className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Chart Type
                </Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.chart_type ?? ""}
                  onChange={(e) => set("chart_type", e.target.value || null)}
                >
                  <option value="">No chart</option>
                  {CHART_TYPES.filter(Boolean).map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)} Chart
                    </option>
                  ))}
                </select>
              </div>
              {form.chart_type && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      X-Axis Field
                    </Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.chart_x_field ?? ""}
                      onChange={(e) => set("chart_x_field", e.target.value || null)}
                    >
                      <option value="">— select field —</option>
                      {form.columns.map((c) => (
                        <option key={c.field} value={c.field}>
                          {c.label} ({c.field})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Y-Axis Field
                    </Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.chart_y_field ?? ""}
                      onChange={(e) => set("chart_y_field", e.target.value || null)}
                    >
                      <option value="">— select field —</option>
                      {form.columns.map((c) => (
                        <option key={c.field} value={c.field}>
                          {c.label} ({c.field})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </TabsContent>

            {/* MONGO PIPELINE */}
            {form.report_type === "mongo" && (
              <TabsContent value="mongo" className="mt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    MongoDB Aggregation Pipeline (JSON)
                  </Label>
                  <Textarea
                    value={form.mongo_pipeline ?? ""}
                    onChange={(e) => set("mongo_pipeline", e.target.value)}
                    placeholder={'[\n  { "$match": { "status": "active" } },\n  { "$group": { "_id": "$category", "count": { "$sum": 1 } } },\n  { "$sort": { "count": -1 } }\n]'}
                    rows={12}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Write a JSON array of aggregation stages. A <code className="font-mono">$match</code> on <code className="font-mono">tenant_id</code> is automatically prepended. Fields in "data" subdocument use <code className="font-mono">data.field_name</code>.
                  </p>
                </div>
              </TabsContent>
            )}

            {/* SCRIPT */}
            {form.report_type === "script" && (
              <TabsContent value="script" className="mt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Python Script
                  </Label>
                  <Textarea
                    value={form.script ?? ""}
                    onChange={(e) => set("script", e.target.value)}
                    placeholder={"# Return a list of dicts\nresult = []\nfor record in frappe.get_all(model_slug):\n    result.append(record)"}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update Report" : "Create Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
