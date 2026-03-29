import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  BookOpen,
  Trash2,
  Zap,
  ChevronDown,
  ChevronRight,
  Pencil,
  Play,
  X,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { rulesApi } from "../api/rules.api";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { notificationsApi } from "@/apps/notifications/api/notifications.api";
import { approvalsApi } from "@/apps/approvals/api/approvals.api";
import { workflowApi } from "@/apps/flow-designer/api/workflow.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGERS = [
  { value: "on_save", label: "On Save" },
  { value: "on_create", label: "On Create" },
  { value: "on_update", label: "On Update" },
  { value: "on_delete", label: "On Delete" },
];

const OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "greater_than", label: ">" },
  { value: "less_than", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "in_list", label: "in list" },
  { value: "not_in_list", label: "not in list" },
  { value: "regex_match", label: "matches regex" },
  { value: "changed_to", label: "changed to" },
  { value: "changed_from", label: "changed from" },
];

const NO_VALUE_OPS = new Set(["is_empty", "is_not_empty"]);

const ACTION_TYPES = [
  { value: "validate", label: "Validate (block save)" },
  { value: "compute", label: "Compute field value" },
  { value: "set_field", label: "Set field value" },
  { value: "send_notification", label: "Send notification" },
  { value: "trigger_approval", label: "Trigger approval flow" },
  { value: "trigger_workflow", label: "Trigger workflow" },
];

function makeCondition() {
  return { field: "", operator: "equals", value: "", logic_group: "AND", nested_conditions: [] };
}

function makeRule() {
  return {
    name: "",
    trigger: "on_save",
    priority: 0,
    condition: makeCondition(),
    action: { type: "validate", config: {} },
    is_active: true,
  };
}

// ── Nested Condition Builder ───────────────────────────────────────────────────

function ConditionRow({ cond, onChange, onRemove, depth = 0 }) {
  const needsValue = !NO_VALUE_OPS.has(cond.operator);

  function set(key, val) {
    onChange({ ...cond, [key]: val });
  }

  function addNested() {
    onChange({ ...cond, nested_conditions: [...(cond.nested_conditions ?? []), makeCondition()] });
  }

  function updateNested(idx, updated) {
    const next = [...(cond.nested_conditions ?? [])];
    next[idx] = updated;
    onChange({ ...cond, nested_conditions: next });
  }

  function removeNested(idx) {
    const next = (cond.nested_conditions ?? []).filter((_, i) => i !== idx);
    onChange({ ...cond, nested_conditions: next });
  }

  const indent = depth * 12;

  return (
    <div className="space-y-1" style={{ marginLeft: indent }}>
      {/* Top condition row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Logic group (shown before nested children) */}
        {depth > 0 && (
          <Select value={cond.logic_group} onValueChange={(v) => set("logic_group", v)}>
            <SelectTrigger className="h-6 w-16 text-xs px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Input
          className="h-7 text-xs w-28 font-mono"
          placeholder="field"
          value={cond.field}
          onChange={(e) => set("field", e.target.value)}
        />
        <Select value={cond.operator} onValueChange={(v) => set("operator", v)}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsValue && (
          <Input
            className="h-7 text-xs w-28"
            placeholder="value"
            value={cond.value ?? ""}
            onChange={(e) => set("value", e.target.value)}
          />
        )}
        <button
          type="button"
          title="Add nested condition"
          onClick={addNested}
          className="ml-auto text-xs text-primary hover:underline shrink-0 flex items-center gap-0.5"
        >
          <Plus className="h-3 w-3" /> AND/OR
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Nested children */}
      {(cond.nested_conditions ?? []).length > 0 && (
        <div className="space-y-1 border-l-2 border-primary/20 pl-3 ml-2">
          {/* Logic label */}
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-muted-foreground">Group logic:</span>
            <Select value={cond.logic_group} onValueChange={(v) => set("logic_group", v)}>
              <SelectTrigger className="h-5 w-14 text-xs px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cond.nested_conditions.map((nc, i) => (
            <ConditionRow
              key={i}
              cond={nc}
              onChange={(updated) => updateNested(i, updated)}
              onRemove={() => removeNested(i)}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── KeyValue editor (reused from Flow Designer) ───────────────────────────────

function KeyValueEditor({ value = {}, onChange }) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const entries = Object.entries(value);

  function add() {
    if (!newKey.trim()) return;
    onChange({ ...value, [newKey.trim()]: newVal });
    setNewKey("");
    setNewVal("");
  }

  function remove(k) {
    const next = { ...value };
    delete next[k];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground shrink-0">{k}</span>
              <span className="text-muted-foreground flex-1 truncate">{String(v)}</span>
              <button type="button" onClick={() => remove(k)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input className="h-7 text-xs" placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <Input
          className="h-7 text-xs"
          placeholder="value"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={add}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Rule Editor Dialog ────────────────────────────────────────────────────────

function RuleDialog({ open, onOpenChange, initial, onSave, isPending }) {
  const [rule, setRule] = useState(initial ?? makeRule());

  const { data: workflows = [] } = useQuery({
    queryKey: ["all-workflows"],
    queryFn: () => workflowApi.listWorkflows(),
    enabled: open && rule.action.type === "trigger_workflow",
  });

  const { data: approvalFlows = [] } = useQuery({
    queryKey: ["approval-flows"],
    queryFn: () => approvalsApi.listFlows(),
    enabled: open && rule.action.type === "trigger_approval",
  });

  const { data: notifTemplates = [] } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => notificationsApi.listTemplates(),
    enabled: open && rule.action.type === "send_notification",
  });

  function handleOpen(o) {
    if (o) setRule(initial ?? makeRule());
    onOpenChange(o);
  }

  function setField(key, val) {
    setRule((r) => ({ ...r, [key]: val }));
  }

  function setAction(key, val) {
    setRule((r) => ({ ...r, action: { ...r.action, [key]: val } }));
  }

  const canSave = rule.name.trim() && rule.condition.field.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Rule" : "Add Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Name + priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Rule name *</Label>
              <Input
                className="h-8 text-sm"
                placeholder="e.g. Required email"
                value={rule.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={rule.priority}
                onChange={(e) => setField("priority", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Trigger */}
          <div className="space-y-1.5">
            <Label className="text-xs">Trigger</Label>
            <Select value={rule.trigger} onValueChange={(v) => setField("trigger", v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condition — supports nested AND/OR groups */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-xs font-semibold text-foreground">
              Condition
              <span className="ml-1 text-muted-foreground font-normal">(click "+ AND/OR" to nest conditions)</span>
            </Label>
            <ConditionRow
              cond={rule.condition}
              onChange={(updated) => setField("condition", updated)}
              onRemove={null}
              depth={0}
            />
          </div>

          {/* Action */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-xs font-semibold text-foreground">Action</Label>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Action type</Label>
              <Select value={rule.action.type} onValueChange={(v) => setAction("type", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Validate: error message */}
            {rule.action.type === "validate" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Error message</Label>
                <Input
                  className="h-7 text-sm"
                  placeholder="Shown to user when validation fails"
                  value={rule.action.config.message ?? ""}
                  onChange={(e) => setAction("config", { ...rule.action.config, message: e.target.value })}
                />
              </div>
            )}

            {/* set_field / compute: target field + expression */}
            {(rule.action.type === "set_field" || rule.action.type === "compute") && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Target field</Label>
                  <Input
                    className="h-7 text-sm"
                    placeholder="field to set"
                    value={rule.action.config.field ?? ""}
                    onChange={(e) => setAction("config", { ...rule.action.config, field: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Value / expression</Label>
                  <Input
                    className="h-7 text-sm"
                    placeholder="static value or {{expression}}"
                    value={rule.action.config.value ?? ""}
                    onChange={(e) => setAction("config", { ...rule.action.config, value: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* trigger_workflow: workflow selector */}
            {rule.action.type === "trigger_workflow" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Workflow</Label>
                <Select
                  value={rule.action.config.workflow_id ?? ""}
                  onValueChange={(v) => setAction("config", { ...rule.action.config, workflow_id: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* trigger_approval: approval flow selector */}
            {rule.action.type === "trigger_approval" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Approval Flow</Label>
                <Select
                  value={rule.action.config.flow_id ?? ""}
                  onValueChange={(v) => setAction("config", { ...rule.action.config, flow_id: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select approval flow" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvalFlows.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* send_notification: template + recipient */}
            {rule.action.type === "send_notification" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Template</Label>
                  <Select
                    value={rule.action.config.template_id ?? ""}
                    onValueChange={(v) => setAction("config", { ...rule.action.config, template_id: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {notifTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Recipient (user ID or field)</Label>
                  <Input
                    className="h-7 text-sm"
                    placeholder="user ID or field name (e.g. created_by)"
                    value={rule.action.config.recipient ?? ""}
                    onChange={(e) => setAction("config", { ...rule.action.config, recipient: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(rule)} disabled={!canSave || isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Evaluate Panel ────────────────────────────────────────────────────────────

function EvaluatePanel({ ruleset, selectedModelId, selectedAppId }) {
  const [trigger, setTrigger] = useState("on_save");
  const [recordJson, setRecordJson] = useState("{\n  \n}");
  const [result, setResult] = useState(null);
  const [jsonError, setJsonError] = useState("");

  const evaluate = useMutation({
    mutationFn: () => {
      let data;
      try { data = JSON.parse(recordJson); } catch { throw new Error("Invalid JSON"); }
      return rulesApi.evaluate({
        model_id: selectedModelId,
        app_id: selectedAppId,
        trigger,
        record_data: data,
      });
    },
    onSuccess: (data) => { setResult(data); setJsonError(""); },
    onError: (e) => { setJsonError(e.message); },
  });

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-semibold text-foreground">Test / Evaluate</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Trigger</Label>
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGERS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            size="sm"
            className="h-7 text-xs w-full"
            onClick={() => evaluate.mutate()}
            disabled={evaluate.isPending}
          >
            <Play className="h-3 w-3" />
            {evaluate.isPending ? "Evaluating…" : "Run"}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Record data (JSON)</Label>
        <Textarea
          className="font-mono text-xs"
          rows={4}
          value={recordJson}
          onChange={(e) => setRecordJson(e.target.value)}
          placeholder='{"field": "value"}'
        />
        {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
      </div>

      {result && (
        <div className="space-y-2 text-xs">
          <div className="flex gap-3">
            <span className="text-green-600 font-medium">✓ {result.passed_rules?.length ?? 0} passed</span>
            <span className="text-destructive font-medium">✗ {result.failed_rules?.length ?? 0} failed</span>
            {result.errors?.length > 0 && (
              <span className="text-amber-600 font-medium">⚠ {result.errors.length} error(s)</span>
            )}
          </div>

          {result.failed_rules?.length > 0 && (
            <div className="space-y-1">
              {result.failed_rules.map((r, i) => (
                <div key={i} className="rounded bg-destructive/10 px-2 py-1.5">
                  <span className="font-medium text-destructive">{r.rule_name}</span>
                  {r.error && <p className="text-muted-foreground">{r.error}</p>}
                </div>
              ))}
            </div>
          )}

          {result.triggered_actions?.length > 0 && (
            <div>
              <p className="text-muted-foreground">Actions triggered: {result.triggered_actions.join(", ")}</p>
            </div>
          )}

          {Object.keys(result.computed_values ?? {}).length > 0 && (
            <div>
              <p className="text-muted-foreground">
                Computed: {JSON.stringify(result.computed_values)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ruleset Card with Rule Management ─────────────────────────────────────────

function RulesetCard({ rs, selectedModelId, selectedAppId, onDelete }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRule, setEditRule] = useState(null); // { rule, index }

  const updateRuleset = useMutation({
    mutationFn: (rules) => rulesApi.updateRuleset(rs.id, { rules }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules", "rulesets", rs.model_id] });
      toast.success("Ruleset updated");
    },
    onError: (e) => toast.error(e.message),
  });

  function addRule(rule) {
    const updated = [...(rs.rules ?? []), rule];
    updateRuleset.mutate(updated, { onSuccess: () => setAddOpen(false) });
  }

  function saveRule(rule, idx) {
    const updated = [...(rs.rules ?? [])];
    updated[idx] = rule;
    updateRuleset.mutate(updated, { onSuccess: () => setEditRule(null) });
  }

  function deleteRule(idx) {
    const updated = (rs.rules ?? []).filter((_, i) => i !== idx);
    updateRuleset.mutate(updated);
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div
          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
          onClick={() => setExpanded((p) => !p)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <CardTitle className="text-sm truncate">{rs.name}</CardTitle>
          <Badge variant={rs.is_active ? "default" : "secondary"} className="text-xs shrink-0">
            {rs.is_active ? "Active" : "Inactive"}
          </Badge>
          <Badge variant="outline" className="text-xs shrink-0">
            {rs.rules?.length ?? 0} rule{(rs.rules?.length ?? 0) !== 1 ? "s" : ""}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDelete(rs.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Rules list */}
          {(rs.rules ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-1">
              No rules yet — add the first rule
            </p>
          ) : (
            <div className="space-y-2">
              {rs.rules.map((rule, i) => (
                <div
                  key={rule.id ?? i}
                  className="rounded-lg border border-border p-3 text-sm flex items-start gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="font-medium truncate">{rule.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {TRIGGERS.find((t) => t.value === rule.trigger)?.label ?? rule.trigger}
                      </Badge>
                      {!rule.is_active && (
                        <Badge variant="secondary" className="text-xs">inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground ml-5">
                      If <span className="font-mono text-foreground">{rule.condition?.field}</span>{" "}
                      {OPERATORS.find((o) => o.value === rule.condition?.operator)?.label}{" "}
                      {!NO_VALUE_OPS.has(rule.condition?.operator) && (
                        <span className="font-mono text-foreground">
                          {String(rule.condition?.value ?? "")}
                        </span>
                      )}{" "}
                      → {ACTION_TYPES.find((a) => a.value === rule.action?.type)?.label ?? rule.action?.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditRule({ rule, index: i })}
                      className="text-muted-foreground hover:text-foreground p-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(i)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3 w-3" /> Add Rule
          </Button>

          {/* Evaluate panel */}
          <EvaluatePanel
            ruleset={rs}
            selectedModelId={selectedModelId}
            selectedAppId={selectedAppId}
          />
        </CardContent>
      )}

      {/* Add rule dialog */}
      <RuleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={null}
        onSave={addRule}
        isPending={updateRuleset.isPending}
      />

      {/* Edit rule dialog */}
      {editRule && (
        <RuleDialog
          open={!!editRule}
          onOpenChange={(o) => { if (!o) setEditRule(null); }}
          initial={editRule.rule}
          onSave={(rule) => saveRule(rule, editRule.index)}
          isPending={updateRuleset.isPending}
        />
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function RulesEnginePage() {
  const qc = useQueryClient();
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [rulesetName, setRulesetName] = useState("");

  const { data: apps = [] } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ["apps", selectedAppId, "models"],
    queryFn: () => schemaApi.listModels(selectedAppId),
    enabled: !!selectedAppId,
  });

  const { data: rulesets = [], isLoading: rulesetsLoading } = useQuery({
    queryKey: ["rules", "rulesets", selectedModelId],
    queryFn: () => rulesApi.listRulesets(selectedModelId),
    enabled: !!selectedModelId,
  });

  const createRuleset = useMutation({
    mutationFn: () =>
      rulesApi.createRuleset(selectedModelId, {
        name: rulesetName,
        model_id: selectedModelId,
        app_id: selectedAppId,
        rules: [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules", "rulesets", selectedModelId] });
      setCreateOpen(false);
      setRulesetName("");
      toast.success("Ruleset created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRuleset = useMutation({
    mutationFn: (rulesetId) => rulesApi.deleteRuleset(rulesetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules", "rulesets", selectedModelId] });
      toast.success("Ruleset deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Rules Engine</h2>
        <p className="text-sm text-muted-foreground">
          Define business rules that validate and transform records automatically
        </p>
      </div>

      {/* Context selectors */}
      <div className="flex gap-4">
        <div className="w-64 space-y-1">
          <Label className="text-xs">App</Label>
          <Select
            value={selectedAppId}
            onValueChange={(v) => { setSelectedAppId(v); setSelectedModelId(""); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an app" />
            </SelectTrigger>
            <SelectContent>
              {apps.map((app) => (
                <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-64 space-y-1">
          <Label className="text-xs">Model</Label>
          <Select
            value={selectedModelId}
            onValueChange={setSelectedModelId}
            disabled={!selectedAppId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rulesets */}
      {selectedModelId && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4" /> New Ruleset
            </Button>
          </div>

          {rulesetsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : rulesets.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-foreground">No rulesets</p>
              <p className="text-sm text-muted-foreground">
                Create a ruleset to define business rules for this model
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rulesets.map((rs) => (
                <RulesetCard
                  key={rs.id}
                  rs={rs}
                  selectedModelId={selectedModelId}
                  selectedAppId={selectedAppId}
                  onDelete={(id) => deleteRuleset.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Ruleset dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Ruleset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Ruleset name *</Label>
              <Input
                placeholder="e.g. Validation Rules"
                value={rulesetName}
                onChange={(e) => setRulesetName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createRuleset.mutate()}
              disabled={!rulesetName.trim() || createRuleset.isPending}
            >
              {createRuleset.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
