import { useState } from "react";
import { Settings } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Separator } from "@/shared/components/ui/separator";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { schemaApi } from "../api/schema.api";

/**
 * Right-panel field configuration.
 *
 * Props:
 *   field      – current field object (uses backend shape: name, label, type, config, is_required, …)
 *   allModels  – all ModelDefinition objects in this app (for same-app RELATION picker)
 *   currentAppId – the app being edited (used to default cross-app picker)
 *   onUpdate   – (updates: Partial<Field>) => void
 */
export function FieldConfig({ field, allModels = [], currentAppId, onUpdate }) {
  if (!field) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border bg-card text-center p-6">
        <Settings className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Select a field to configure it</p>
      </div>
    );
  }

  // Helper: update a key inside field.config
  const updateConfig = (key, value) =>
    onUpdate({ config: { ...(field.config ?? {}), [key]: value } });

  // Cross-app relation: fetch all apps in tenant
  const { data: allApps = [] } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
    enabled: field?.type === "relation",
    staleTime: 30_000,
  });

  // The app chosen for cross-app relation (defaults to currentAppId = same app)
  const selectedRelationAppId = field?.config?.target_app_id || currentAppId;

  // Models for the selected relation app
  const { data: relationAppModels = [] } = useQuery({
    queryKey: ["apps", selectedRelationAppId, "models"],
    queryFn: () => schemaApi.listModels(selectedRelationAppId),
    enabled: field?.type === "relation" && !!selectedRelationAppId,
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Field Config
        </p>
        <p className="text-sm font-medium text-foreground mt-0.5 truncate">{field.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Type:{" "}
          <span className="font-mono bg-muted px-1 rounded text-xs">{field.type}</span>
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">

          {/* ── Label ──────────────────────────────────────────────────────── */}
          <ConfigRow label="Label">
            <Input
              value={field.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value })}
              onFocus={(e) => e.target.select()}
              placeholder="Display name"
            />
          </ConfigRow>

          {/* ── Field name (DB column key) ──────────────────────────────── */}
          <ConfigRow label="Field name (DB key)">
            <Input
              value={field.name ?? ""}
              onChange={(e) =>
                onUpdate({
                  name: e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "_")
                    .replace(/[^a-z0-9_]/g, ""),
                  id: e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "_")
                    .replace(/[^a-z0-9_]/g, ""),
                })
              }
              placeholder="snake_case_name"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Only lowercase letters, numbers, underscore.
            </p>
          </ConfigRow>

          {/* ── Placeholder ─────────────────────────────────────────────── */}
          {["text", "number", "email", "phone", "url", "currency", "rich_text", "json"].includes(field.type) && (
            <ConfigRow label="Placeholder">
              <Input
                value={field.config?.placeholder ?? ""}
                onChange={(e) => updateConfig("placeholder", e.target.value)}
                placeholder="Hint text…"
              />
            </ConfigRow>
          )}

          {/* ── Description ─────────────────────────────────────────────── */}
          <ConfigRow label="Description">
            <Textarea
              value={field.config?.description ?? ""}
              onChange={(e) => updateConfig("description", e.target.value)}
              placeholder="Helper text shown below the field"
              rows={2}
            />
          </ConfigRow>

          <Separator />

          {/* ── Core toggles ────────────────────────────────────────────── */}
          <ToggleRow
            label="Required"
            description="User must fill this field"
            checked={field.is_required ?? false}
            onCheckedChange={(v) => onUpdate({ is_required: v })}
          />
          <ToggleRow
            label="Unique"
            description="No two records can share this value"
            checked={field.config?.unique ?? false}
            onCheckedChange={(v) => updateConfig("unique", v)}
          />
          <ToggleRow
            label="Searchable"
            description="Include in full-text search"
            checked={field.is_searchable ?? false}
            onCheckedChange={(v) => onUpdate({ is_searchable: v })}
          />
          <ToggleRow
            label="Filterable"
            description="Can be used as a filter"
            checked={field.is_filterable ?? true}
            onCheckedChange={(v) => onUpdate({ is_filterable: v })}
          />
          <ToggleRow
            label="Hidden"
            description="Hide from the records form"
            checked={field.config?.hidden ?? false}
            onCheckedChange={(v) => updateConfig("hidden", v)}
          />
          <ToggleRow
            label="Read-only"
            description="Show but prevent editing"
            checked={field.config?.read_only ?? false}
            onCheckedChange={(v) => updateConfig("read_only", v)}
          />

          {/* ── Permission Level ─────────────────────────────────────────── */}
          <ConfigRow label="Perm Level (0–9)">
            <Input
              type="number"
              min={0}
              max={9}
              value={field.perm_level ?? 0}
              onChange={(e) => onUpdate({ perm_level: Math.min(9, Math.max(0, Number(e.target.value) || 0)) })}
              className="w-20"
            />
            <p className="text-xs text-muted-foreground">
              Role must have perm_level ≥ this to read/write the field.
            </p>
          </ConfigRow>

          {/* ── Show in List View ───────────────────────────────────────── */}
          <ToggleRow
            label="Show in List View"
            description="Display this field as a column in the records list table"
            checked={field.in_list_view ?? false}
            onCheckedChange={(v) => onUpdate({ in_list_view: v })}
          />

          {/* ── Depends On (conditional visibility) ──────────────────────── */}
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depends On (show if…)</Label>
            <p className="text-xs text-muted-foreground">
              Show this field only when a condition is met. Leave blank to always show.
            </p>
            {(() => {
              const dep = field.config?.depends_on;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={dep?.field ?? ""}
                      onChange={(e) => updateConfig("depends_on", { ...(dep ?? {}), field: e.target.value })}
                      placeholder="field_name"
                      className="flex-1 h-7 text-xs font-mono"
                    />
                    <select
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs h-7"
                      value={dep?.operator ?? "equals"}
                      onChange={(e) => updateConfig("depends_on", { ...(dep ?? {}), operator: e.target.value })}
                    >
                      {["equals","not_equals","contains","is_set","is_not_set"].map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                    {!["is_set","is_not_set"].includes(dep?.operator) && (
                      <Input
                        value={dep?.value ?? ""}
                        onChange={(e) => updateConfig("depends_on", { ...(dep ?? {}), value: e.target.value })}
                        placeholder="value"
                        className="flex-1 h-7 text-xs"
                      />
                    )}
                    {dep?.field && (
                      <button
                        type="button"
                        className="text-destructive text-xs hover:underline shrink-0"
                        onClick={() => updateConfig("depends_on", null)}
                      >Clear</button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Mandatory If ─────────────────────────────────────────────── */}
          <ConfigRow label="Mandatory If">
            <Input
              value={field.mandatory_depends_on ?? ""}
              onChange={(e) => onUpdate({ mandatory_depends_on: e.target.value || null })}
              placeholder="e.g. status == 'active'"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Field becomes required when this condition is true.
            </p>
          </ConfigRow>

          {/* ── Read Only If ─────────────────────────────────────────────── */}
          <ConfigRow label="Read Only If">
            <Input
              value={field.read_only_depends_on ?? ""}
              onChange={(e) => onUpdate({ read_only_depends_on: e.target.value || null })}
              placeholder="e.g. status == 'closed'"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Field becomes read-only when this condition is true.
            </p>
          </ConfigRow>

          {/* ── Fetch From ───────────────────────────────────────────────── */}
          <ConfigRow label="Fetch From">
            <Input
              value={field.fetch_from ?? ""}
              onChange={(e) => onUpdate({ fetch_from: e.target.value || null })}
              placeholder="e.g. Customer.email"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Auto-fill from a linked model field. Format: ModelSlug.field_name
            </p>
          </ConfigRow>

          {/* ══ Type-specific config ════════════════════════════════════════ */}

          {/* TEXT – min/max length + regex pattern */}
          {field.type === "text" && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <ConfigRow label="Min length">
                  <Input
                    type="number"
                    min={0}
                    value={field.config?.min_length ?? ""}
                    onChange={(e) =>
                      updateConfig("min_length", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="No min"
                  />
                </ConfigRow>
                <ConfigRow label="Max length">
                  <Input
                    type="number"
                    min={1}
                    value={field.config?.max_length ?? ""}
                    onChange={(e) =>
                      updateConfig("max_length", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="No max"
                  />
                </ConfigRow>
              </div>
              <ConfigRow label="Regex pattern (optional)">
                <Input
                  value={field.config?.pattern ?? ""}
                  onChange={(e) => updateConfig("pattern", e.target.value)}
                  placeholder="e.g. ^[A-Z]{3}\\d+$"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to skip pattern validation.
                </p>
              </ConfigRow>
              <ConfigRow label="Default value">
                <Input
                  value={field.default_value ?? ""}
                  onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                  placeholder="Default text"
                />
              </ConfigRow>
            </>
          )}

          {/* RICH_TEXT – max length */}
          {field.type === "rich_text" && (
            <>
              <Separator />
              <ConfigRow label="Max length (characters)">
                <Input
                  type="number"
                  min={1}
                  value={field.config?.max_length ?? ""}
                  onChange={(e) =>
                    updateConfig("max_length", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  placeholder="No limit"
                />
              </ConfigRow>
            </>
          )}

          {/* NUMBER / CURRENCY – min / max / step + default */}
          {["number", "currency"].includes(field.type) && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <ConfigRow label="Min value">
                  <Input
                    type="number"
                    value={field.config?.min ?? ""}
                    onChange={(e) =>
                      updateConfig("min", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="No min"
                  />
                </ConfigRow>
                <ConfigRow label="Max value">
                  <Input
                    type="number"
                    value={field.config?.max ?? ""}
                    onChange={(e) =>
                      updateConfig("max", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="No max"
                  />
                </ConfigRow>
              </div>
              <ConfigRow label="Step">
                <Input
                  type="number"
                  min={0}
                  value={field.config?.step ?? ""}
                  onChange={(e) =>
                    updateConfig("step", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  placeholder="e.g. 0.01"
                />
              </ConfigRow>
              {field.type === "currency" && (
                <ConfigRow label="Currency symbol">
                  <Input
                    value={field.config?.currency_symbol ?? "$"}
                    onChange={(e) => updateConfig("currency_symbol", e.target.value)}
                    placeholder="$"
                    className="w-20"
                  />
                </ConfigRow>
              )}
              <ConfigRow label="Default value">
                <Input
                  type="number"
                  value={field.default_value ?? ""}
                  onChange={(e) => onUpdate({ default_value: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="No default"
                />
              </ConfigRow>
            </>
          )}

          {/* DATE / DATETIME – min / max date + default to today */}
          {["date", "datetime"].includes(field.type) && (
            <>
              <Separator />
              <ConfigRow label="Min date">
                <Input
                  type={field.type === "datetime" ? "datetime-local" : "date"}
                  value={field.config?.min_date ?? ""}
                  onChange={(e) => updateConfig("min_date", e.target.value || undefined)}
                />
              </ConfigRow>
              <ConfigRow label="Max date">
                <Input
                  type={field.type === "datetime" ? "datetime-local" : "date"}
                  value={field.config?.max_date ?? ""}
                  onChange={(e) => updateConfig("max_date", e.target.value || undefined)}
                />
              </ConfigRow>
              <ToggleRow
                label="Default to today"
                description="Pre-fill with current date/time"
                checked={field.config?.default_today ?? false}
                onCheckedChange={(v) => updateConfig("default_today", v)}
              />
            </>
          )}

          {/* BOOLEAN – default value */}
          {field.type === "boolean" && (
            <>
              <Separator />
              <ToggleRow
                label="Default value"
                description="Checked by default when creating a record"
                checked={field.default_value === true}
                onCheckedChange={(v) => onUpdate({ default_value: v })}
              />
            </>
          )}

          {/* SELECT / MULTISELECT – options list + allow_custom */}
          {["select", "multiselect"].includes(field.type) && (
            <>
              <Separator />
              <ConfigRow label="Options (one per line)">
                <Textarea
                  value={(field.config?.options ?? []).join("\n")}
                  onChange={(e) =>
                    updateConfig(
                      "options",
                      e.target.value.split("\n").filter((s) => s.trim() !== ""),
                    )
                  }
                  placeholder={"Option A\nOption B\nOption C"}
                  rows={5}
                />
                <p className="text-xs text-muted-foreground">
                  {(field.config?.options ?? []).length} option(s) defined
                </p>
              </ConfigRow>
              <ToggleRow
                label="Allow custom value"
                description="User can type a value not in the list"
                checked={field.config?.allow_custom ?? false}
                onCheckedChange={(v) => updateConfig("allow_custom", v)}
              />
              {field.type === "select" && (
                <ConfigRow label="Default option">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={field.default_value ?? ""}
                    onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                  >
                    <option value="">— no default —</option>
                    {(field.config?.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </ConfigRow>
              )}
            </>
          )}

          {/* RELATION – pick related app + model (cross-app supported) */}
          {field.type === "relation" && (
            <>
              <Separator />
              <ConfigRow label="Related app">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.target_app_id ?? currentAppId ?? ""}
                  onChange={(e) => {
                    const newAppId = e.target.value;
                    // Reset model when app changes
                    onUpdate({
                      config: {
                        ...(field.config ?? {}),
                        target_app_id: newAppId === currentAppId ? undefined : newAppId,
                        related_model_slug: "",
                      },
                    });
                  }}
                >
                  {allApps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.id === currentAppId ? " (this app)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Link to a model in any app — including other apps in this tenant.
                </p>
              </ConfigRow>
              <ConfigRow label="Related model">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.related_model_slug ?? ""}
                  onChange={(e) => updateConfig("related_model_slug", e.target.value)}
                >
                  <option value="">— select a model —</option>
                  {relationAppModels.map((m) => (
                    <option key={m.id} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </ConfigRow>
              <ConfigRow label="Display field">
                <Input
                  value={field.config?.display_field ?? "name"}
                  onChange={(e) => updateConfig("display_field", e.target.value)}
                  placeholder="name"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Which field from the related record to show in dropdowns.
                </p>
              </ConfigRow>
              <ToggleRow
                label="Allow multiple"
                description="Link to more than one related record"
                checked={field.config?.allow_multiple ?? false}
                onCheckedChange={(v) => updateConfig("allow_multiple", v)}
              />

              {/* ── Fetch From mappings ────────────────────────────────── */}
              {field.config?.related_model_slug && (() => {
                const relModel = relationAppModels.find((m) => m.slug === field.config.related_model_slug);
                const relFields = relModel?.fields ?? [];
                const fetchMappings = field.config?.fetch_from ?? [];
                return (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fetch From (auto-fill)</Label>
                      <p className="text-xs text-muted-foreground">
                        When this relation changes, copy fields from the linked record into this record.
                      </p>
                      {fetchMappings.map((mapping, i) => (
                        <div key={mapping._uid ?? i} className="flex items-center gap-2">
                          <select
                            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                            value={mapping.source_field ?? ""}
                            onChange={(e) => {
                              const updated = [...fetchMappings];
                              updated[i] = { ...mapping, source_field: e.target.value };
                              updateConfig("fetch_from", updated);
                            }}
                          >
                            <option value="">— source field —</option>
                            {relFields.map((f) => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
                          </select>
                          <span className="text-xs text-muted-foreground shrink-0">→</span>
                          <Input
                            value={mapping.target_field ?? ""}
                            onChange={(e) => {
                              const updated = [...fetchMappings];
                              updated[i] = { ...mapping, target_field: e.target.value };
                              updateConfig("fetch_from", updated);
                            }}
                            placeholder="target field name"
                            className="flex-1 h-7 text-xs font-mono"
                          />
                          <button
                            type="button"
                            className="text-destructive hover:text-destructive/80 shrink-0"
                            onClick={() => updateConfig("fetch_from", fetchMappings.filter((_, j) => j !== i))}
                          >×</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => updateConfig("fetch_from", [...fetchMappings, { _uid: crypto.randomUUID(), source_field: "", target_field: "" }])}
                      >
                        + Add mapping
                      </button>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* FILE – allowed types + max size */}
          {field.type === "file" && (
            <>
              <Separator />
              <ConfigRow label="Allowed types (comma-separated)">
                <Input
                  value={field.config?.allowed_types ?? ""}
                  onChange={(e) => updateConfig("allowed_types", e.target.value)}
                  placeholder="pdf,png,jpg"
                />
              </ConfigRow>
              <ConfigRow label="Max size (MB)">
                <Input
                  type="number"
                  value={field.config?.max_size_mb ?? ""}
                  onChange={(e) =>
                    updateConfig("max_size_mb", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  placeholder="10"
                />
              </ConfigRow>
              <ToggleRow
                label="Allow multiple files"
                description="User can attach more than one file"
                checked={field.config?.allow_multiple ?? false}
                onCheckedChange={(v) => updateConfig("allow_multiple", v)}
              />
            </>
          )}

          {/* USER_REF – allow multiple + filter by role */}
          {field.type === "user_ref" && (
            <>
              <Separator />
              <ToggleRow
                label="Allow multiple users"
                description="Link to more than one user"
                checked={field.config?.allow_multiple ?? false}
                onCheckedChange={(v) => updateConfig("allow_multiple", v)}
              />
              <ConfigRow label="Filter by role (optional)">
                <Input
                  value={field.config?.filter_role ?? ""}
                  onChange={(e) => updateConfig("filter_role", e.target.value || undefined)}
                  placeholder="e.g. admin, manager"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to show all users.
                </p>
              </ConfigRow>
            </>
          )}

          {/* CHILD_TABLE – define inline sub-record columns */}
          {field.type === "child_table" && (
            <ChildTableFieldsEditor
              childFields={field.config?.child_fields ?? []}
              onChange={(child_fields) => updateConfig("child_fields", child_fields)}
            />
          )}

          {/* ROLLUP – aggregate over child records */}
          {field.type === "rollup" && (
            <>
              <Separator />
              <ConfigRow label="Source model (child)">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.source_model ?? ""}
                  onChange={(e) => updateConfig("source_model", e.target.value)}
                >
                  <option value="">— select child model —</option>
                  {allModels.map((m) => (
                    <option key={m.id} value={m.slug}>{m.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The child model whose records will be aggregated.
                </p>
              </ConfigRow>
              <ConfigRow label="Relation field (on child)">
                <Input
                  value={field.config?.relation_field ?? ""}
                  onChange={(e) => updateConfig("relation_field", e.target.value)}
                  placeholder="e.g. project_id"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The field on the child model that stores the parent record ID.
                </p>
              </ConfigRow>
              <ConfigRow label="Aggregate function">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.function ?? "count"}
                  onChange={(e) => updateConfig("function", e.target.value)}
                >
                  <option value="count">COUNT — number of child records</option>
                  <option value="sum">SUM — total of a numeric field</option>
                  <option value="avg">AVG — average of a numeric field</option>
                  <option value="min">MIN — minimum value</option>
                  <option value="max">MAX — maximum value</option>
                </select>
              </ConfigRow>
              <ConfigRow label="Source field (to aggregate)">
                <Input
                  value={field.config?.source_field ?? ""}
                  onChange={(e) => updateConfig("source_field", e.target.value)}
                  placeholder="e.g. story_points"
                  className="font-mono text-sm"
                  disabled={field.config?.function === "count" || !field.config?.function}
                />
                <p className="text-xs text-muted-foreground">
                  Not used for COUNT.
                </p>
              </ConfigRow>
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Optional filter
              </p>
              <div className="grid grid-cols-2 gap-2">
                <ConfigRow label="Filter field">
                  <Input
                    value={field.config?.filter?.field ?? ""}
                    onChange={(e) =>
                      updateConfig("filter", { ...(field.config?.filter ?? {}), field: e.target.value })
                    }
                    placeholder="e.g. status"
                    className="font-mono text-sm"
                  />
                </ConfigRow>
                <ConfigRow label="Operator">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={field.config?.filter?.operator ?? "equals"}
                    onChange={(e) =>
                      updateConfig("filter", { ...(field.config?.filter ?? {}), operator: e.target.value })
                    }
                  >
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                    <option value="greater_than">greater than</option>
                    <option value="less_than">less than</option>
                    <option value="greater_equal">greater or equal</option>
                    <option value="less_equal">less or equal</option>
                  </select>
                </ConfigRow>
              </div>
              <ConfigRow label="Filter value">
                <Input
                  value={field.config?.filter?.value ?? ""}
                  onChange={(e) =>
                    updateConfig("filter", { ...(field.config?.filter ?? {}), value: e.target.value })
                  }
                  placeholder="e.g. done"
                />
                <p className="text-xs text-muted-foreground">Leave blank to remove the filter.</p>
              </ConfigRow>
            </>
          )}

          {/* FORMULA – expression editor */}
          {field.type === "formula" && (
            <>
              <Separator />
              <ConfigRow label="Expression">
                <Textarea
                  value={field.config?.expression ?? ""}
                  onChange={(e) => updateConfig("expression", e.target.value)}
                  placeholder="e.g. price * quantity"
                  rows={3}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Python arithmetic. Reference numeric fields by name.{" "}
                  Supported: +, -, *, /, **, abs(), round(), min(), max().
                </p>
              </ConfigRow>
              {allModels.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Available numeric fields
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {allModels
                      .flatMap((m) => m.fields ?? [])
                      .filter((f) => ["number", "currency"].includes(f.type) && f.name !== field.name)
                      .map((f) => (
                        <button
                          key={f.name}
                          type="button"
                          onClick={() => {
                            const expr = field.config?.expression ?? "";
                            updateConfig("expression", expr ? `${expr} + ${f.name}` : f.name);
                          }}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono hover:bg-primary/10 hover:text-primary transition-colors"
                          title={`Insert: ${f.name}`}
                        >
                          {f.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <ConfigRow label="Result format">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.result_format ?? "number"}
                  onChange={(e) => updateConfig("result_format", e.target.value)}
                >
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="percent">Percent</option>
                  <option value="text">Text</option>
                </select>
              </ConfigRow>
            </>
          )}

          {/* JSON – schema hint */}
          {field.type === "json" && (
            <>
              <Separator />
              <ConfigRow label="Default value (JSON)">
                <Textarea
                  value={
                    field.default_value != null
                      ? (typeof field.default_value === "string"
                          ? field.default_value
                          : JSON.stringify(field.default_value, null, 2))
                      : ""
                  }
                  onChange={(e) => {
                    try {
                      onUpdate({ default_value: e.target.value ? JSON.parse(e.target.value) : null });
                    } catch {
                      // allow typing invalid JSON without crashing
                    }
                  }}
                  placeholder='e.g. {"key": "value"}'
                  rows={3}
                  className="font-mono text-sm"
                />
              </ConfigRow>
              <ToggleRow
                label="Pretty-print in table"
                description="Show formatted JSON in the records table"
                checked={field.config?.pretty_print ?? false}
                onCheckedChange={(v) => updateConfig("pretty_print", v)}
              />
            </>
          )}

          {/* COLOR – default color picker */}
          {field.type === "color" && (
            <>
              <Separator />
              <ConfigRow label="Default Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={field.default_value ?? "#000000"}
                    onChange={(e) => onUpdate({ default_value: e.target.value })}
                    className="h-9 w-16 cursor-pointer rounded border border-input bg-background p-1"
                  />
                  <Input
                    value={field.default_value ?? ""}
                    onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                    placeholder="#000000"
                    className="font-mono text-sm flex-1"
                  />
                </div>
              </ConfigRow>
            </>
          )}

          {/* RATING – max stars */}
          {field.type === "rating" && (
            <>
              <Separator />
              <ConfigRow label="Max Stars">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={field.config?.max_stars ?? 5}
                  onChange={(e) =>
                    updateConfig("max_stars", Math.min(10, Math.max(1, Number(e.target.value) || 5)))
                  }
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">Between 1 and 10 stars.</p>
              </ConfigRow>
            </>
          )}

          {/* GEOLOCATION – default lat/lng */}
          {field.type === "geolocation" && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <ConfigRow label="Default Lat">
                  <Input
                    type="number"
                    step="any"
                    value={field.config?.default_lat ?? ""}
                    onChange={(e) =>
                      updateConfig("default_lat", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="e.g. 37.7749"
                  />
                </ConfigRow>
                <ConfigRow label="Default Lng">
                  <Input
                    type="number"
                    step="any"
                    value={field.config?.default_lng ?? ""}
                    onChange={(e) =>
                      updateConfig("default_lng", e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="e.g. -122.4194"
                  />
                </ConfigRow>
              </div>
            </>
          )}

          {/* DYNAMIC_LINK – linked model slug */}
          {field.type === "dynamic_link" && (
            <>
              <Separator />
              <ConfigRow label="Linked Model">
                <Input
                  value={field.config?.linked_model ?? ""}
                  onChange={(e) => updateConfig("linked_model", e.target.value)}
                  placeholder="e.g. customer"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The slug of the model this field dynamically links to.
                </p>
              </ConfigRow>
            </>
          )}

          {/* BARCODE – format select */}
          {field.type === "barcode" && (
            <>
              <Separator />
              <ConfigRow label="Barcode Format">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.barcode_format ?? "CODE128"}
                  onChange={(e) => updateConfig("barcode_format", e.target.value)}
                >
                  <option value="CODE128">CODE128</option>
                  <option value="QR">QR Code</option>
                  <option value="EAN13">EAN-13</option>
                  <option value="EAN8">EAN-8</option>
                  <option value="UPC">UPC-A</option>
                  <option value="CODE39">CODE39</option>
                  <option value="ITF14">ITF-14</option>
                  <option value="PDF417">PDF417</option>
                  <option value="DATAMATRIX">Data Matrix</option>
                </select>
              </ConfigRow>
            </>
          )}

          {/* HTML – default HTML textarea */}
          {field.type === "html" && (
            <>
              <Separator />
              <ConfigRow label="Default HTML">
                <Textarea
                  value={field.default_value ?? ""}
                  onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                  placeholder="<p>Default content…</p>"
                  rows={5}
                  className="font-mono text-sm"
                />
              </ConfigRow>
            </>
          )}

          {/* ATTACH_IMAGE – max file size */}
          {field.type === "attach_image" && (
            <>
              <Separator />
              <ConfigRow label="Max File Size (MB)">
                <Input
                  type="number"
                  min={1}
                  value={field.config?.max_size_mb ?? ""}
                  onChange={(e) =>
                    updateConfig("max_size_mb", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  placeholder="e.g. 5"
                />
              </ConfigRow>
              <ToggleRow
                label="Allow multiple images"
                description="User can attach more than one image"
                checked={field.config?.allow_multiple ?? false}
                onCheckedChange={(v) => updateConfig("allow_multiple", v)}
              />
            </>
          )}

          {/* TABLE_MULTISELECT – related model + display field */}
          {field.type === "table_multiselect" && (
            <>
              <Separator />
              <ConfigRow label="Related model">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.related_model_slug ?? ""}
                  onChange={(e) => updateConfig("related_model_slug", e.target.value)}
                >
                  <option value="">— select a model —</option>
                  {allModels.map((m) => (
                    <option key={m.id} value={m.slug}>{m.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Records from this model will appear as multi-select options.
                </p>
              </ConfigRow>
              <ConfigRow label="Display field">
                <Input
                  value={field.config?.display_field ?? "name"}
                  onChange={(e) => updateConfig("display_field", e.target.value)}
                  placeholder="name"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Field from the related record to show as the option label.
                </p>
              </ConfigRow>
            </>
          )}

          {/* ICON – icon picker hint */}
          {field.type === "icon" && (
            <>
              <Separator />
              <ConfigRow label="Default Icon">
                <Input
                  value={field.default_value ?? ""}
                  onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                  placeholder="e.g. star, check, user"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Lucide icon name (lowercase, e.g. "star", "home", "bell").
                </p>
              </ConfigRow>
            </>
          )}

          {/* SECTION_BREAK – collapsible toggle */}
          {field.type === "section_break" && (
            <>
              <Separator />
              <ToggleRow
                label="Collapsible"
                description="Allow users to collapse this section"
                checked={field.config?.collapsible ?? false}
                onCheckedChange={(v) => updateConfig("collapsible", v)}
              />
            </>
          )}

          {/* COLUMN_BREAK – number of columns */}
          {field.type === "column_break" && (
            <>
              <Separator />
              <ConfigRow label="Number of Columns">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.config?.num_columns ?? 2}
                  onChange={(e) => updateConfig("num_columns", Number(e.target.value))}
                >
                  <option value={2}>2 columns</option>
                  <option value={3}>3 columns</option>
                  <option value={4}>4 columns</option>
                </select>
              </ConfigRow>
            </>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}

function ConfigRow({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ── Child Table column definition editor ─────────────────────────────────────

const CHILD_COL_TYPES = [
  "text", "number", "currency", "select", "date", "boolean", "email", "phone", "url",
];

function ChildTableFieldsEditor({ childFields, onChange }) {
  function addCol() {
    onChange([...childFields, { name: `col_${childFields.length + 1}`, label: `Column ${childFields.length + 1}`, type: "text", is_required: false }]);
  }
  function removeCol(i) {
    onChange(childFields.filter((_, idx) => idx !== i));
  }
  function updateCol(i, key, value) {
    const next = childFields.map((c, idx) => idx === i ? { ...c, [key]: value } : c);
    onChange(next);
  }

  return (
    <>
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Child columns
          </Label>
          <button
            type="button"
            onClick={addCol}
            className="text-xs text-primary hover:underline"
          >
            + Add column
          </button>
        </div>
        {childFields.length === 0 && (
          <p className="text-xs text-muted-foreground/70 italic">No columns yet. Add at least one.</p>
        )}
        <div className="space-y-2">
          {childFields.map((col, i) => (
            <div key={col.name || i} className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
              <div className="flex gap-1.5">
                <Input
                  value={col.label}
                  onChange={(e) => {
                    updateCol(i, "label", e.target.value);
                    // Auto-slug the name from label
                    updateCol(i, "name", e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
                  }}
                  placeholder="Column label"
                  className="text-xs h-7 flex-1"
                />
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  value={col.type}
                  onChange={(e) => updateCol(i, "type", e.target.value)}
                >
                  {CHILD_COL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeCol(i)}
                  className="text-destructive hover:text-destructive/70 text-xs px-1"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={col.is_required ?? false}
                  onCheckedChange={(v) => updateCol(i, "is_required", v)}
                  className="h-4 w-7"
                />
                <span className="text-xs text-muted-foreground">Required</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
