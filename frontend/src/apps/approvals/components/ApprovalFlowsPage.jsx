import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  GitBranch,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  X,
  GripVertical,
  UserCheck,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { approvalsApi } from "../api/approvals.api";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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

const APPROVAL_MODES = [
  { value: "any_one", label: "Any One Approver" },
  { value: "all", label: "All Approvers" },
  { value: "majority", label: "Majority" },
];

const ESCALATION_POLICIES = [
  { value: "auto_escalate", label: "Auto-escalate" },
  { value: "auto_reject", label: "Auto-reject" },
];

const APPROVER_TYPES = [
  { value: "role", label: "Role" },
  { value: "user", label: "User" },
  { value: "field_ref", label: "Field Reference" },
];

const SKIP_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty"];

function uid() { return crypto.randomUUID(); }

function makeStage(order) {
  return {
    _uid: uid(),
    name: `Stage ${order + 1}`,
    order,
    approvers: [{ _uid: uid(), type: "role", value: "admin" }],
    approval_mode: "any_one",
    sla_hours: 48,
    escalation_policy: "auto_escalate",
    parallel_with_stage_ids: [],
    skip_condition: null,
  };
}

// ── Skip Condition Editor ──────────────────────────────────────────────────────

function SkipConditionEditor({ condition, onChange }) {
  const enabled = condition !== null && condition !== undefined;

  function toggle(checked) {
    onChange(checked ? { field: "", operator: "equals", value: "" } : null);
  }

  function set(key, val) {
    onChange({ ...condition, [key]: val });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs text-muted-foreground">Skip this stage if condition is met</Label>
        <input
          type="checkbox"
          className="h-3.5 w-3.5 ml-auto"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
        />
      </div>
      {enabled && (
        <div className="grid grid-cols-3 gap-2 pl-5">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Field</Label>
            <Input
              className="h-7 text-xs"
              placeholder="field name"
              value={condition.field}
              onChange={(e) => set("field", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Operator</Label>
            <Select value={condition.operator} onValueChange={(v) => set("operator", v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKIP_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value} className="text-xs">
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input
              className="h-7 text-xs"
              placeholder={NO_VALUE_OPERATORS.includes(condition.operator) ? "—" : "value"}
              disabled={NO_VALUE_OPERATORS.includes(condition.operator)}
              value={NO_VALUE_OPERATORS.includes(condition.operator) ? "" : (condition.value ?? "")}
              onChange={(e) => set("value", e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Approver Row ───────────────────────────────────────────────────────────────

function ApproverRow({ approver, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={approver.type}
        onValueChange={(v) => onChange({ ...approver, type: v })}
      >
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {APPROVER_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value} className="text-xs">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-7 text-xs flex-1"
        placeholder={
          approver.type === "role"
            ? "role name (e.g. manager)"
            : approver.type === "user"
            ? "user ID or email"
            : "field name"
        }
        value={approver.value}
        onChange={(e) => onChange({ ...approver, value: e.target.value })}
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Stage Editor ───────────────────────────────────────────────────────────────

function StageEditor({ stage, index, onUpdate, onRemove, isOnly }) {
  const [open, setOpen] = useState(true);

  function set(key, val) {
    onUpdate({ ...stage, [key]: val });
  }

  function updateApprover(i, val) {
    const next = [...stage.approvers];
    next[i] = val;
    set("approvers", next);
  }

  function removeApprover(i) {
    set("approvers", stage.approvers.filter((_, j) => j !== i));
  }

  function addApprover() {
    set("approvers", [...stage.approvers, { _uid: uid(), type: "role", value: "" }]);
  }

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Stage header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => setOpen((p) => !p)}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
          {index + 1}
        </div>
        <span className="text-sm font-medium flex-1 truncate">{stage.name || `Stage ${index + 1}`}</span>
        <Badge variant="outline" className="text-xs">{stage.approval_mode ?? "any_one"}</Badge>
        <Badge variant="secondary" className="text-xs">{stage.sla_hours ?? 48}h SLA</Badge>
        {!isOnly && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-muted-foreground hover:text-destructive ml-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stage name</Label>
              <Input
                className="h-8 text-sm"
                value={stage.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Approval mode</Label>
              <Select value={stage.approval_mode} onValueChange={(v) => set("approval_mode", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">SLA (hours)</Label>
              <Input
                type="number"
                min={1}
                className="h-8 text-sm"
                value={stage.sla_hours}
                onChange={(e) => set("sla_hours", parseInt(e.target.value) || 48)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">On SLA breach</Label>
              <Select
                value={stage.escalation_policy}
                onValueChange={(v) => set("escalation_policy", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESCALATION_POLICIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Approvers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Approvers</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={addApprover}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {stage.approvers.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No approvers — add at least one</p>
            )}
            <div className="space-y-1.5">
              {stage.approvers.map((ap, i) => (
                <ApproverRow
                  key={ap._uid ?? i}
                  approver={ap}
                  onChange={(val) => updateApprover(i, val)}
                  onRemove={() => removeApprover(i)}
                />
              ))}
            </div>
          </div>

          {/* Skip Condition */}
          <div className="border-t border-border pt-3">
            <SkipConditionEditor
              condition={stage.skip_condition ?? null}
              onChange={(val) => set("skip_condition", val)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stage Builder (list of stages) ────────────────────────────────────────────

function StageBuilder({ stages, onChange }) {
  function updateStage(i, val) {
    const next = [...stages];
    next[i] = val;
    onChange(next);
  }

  function removeStage(i) {
    const next = stages.filter((_, j) => j !== i).map((s, j) => ({ ...s, order: j }));
    onChange(next);
  }

  function addStage() {
    onChange([...stages, makeStage(stages.length)]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Stages</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addStage}>
          <Plus className="h-3 w-3" /> Add Stage
        </Button>
      </div>
      {stages.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-3">
          No stages yet — click "Add Stage"
        </p>
      )}
      <div className="space-y-2">
        {stages.map((stage, i) => (
          <StageEditor
            key={stage._uid ?? i}
            stage={stage}
            index={i}
            onUpdate={(val) => updateStage(i, val)}
            onRemove={() => removeStage(i)}
            isOnly={stages.length === 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Flow Dialog (create + edit) ───────────────────────────────────────────────

function FlowDialog({ open, onOpenChange, title, initial, onSave, isPending }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [stages, setStages] = useState(initial?.stages ?? [makeStage(0)]);

  function handleOpen(o) {
    if (o) {
      setName(initial?.name ?? "");
      setStages(initial?.stages ?? [makeStage(0)]);
    }
    onOpenChange(o);
  }

  const canSave =
    name.trim() &&
    stages.length > 0 &&
    stages.every((s) => s.name.trim() && s.approvers.length > 0 && s.approvers.every((a) => a.value.trim()));

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Flow name *</Label>
            <Input
              placeholder="e.g. Manager Approval"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <StageBuilder stages={stages} onChange={setStages} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({ name, stages })} disabled={!canSave || isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ApprovalFlowsPage() {
  const qc = useQueryClient();
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [expandedFlow, setExpandedFlow] = useState(null);

  const { data: apps = [] } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ["apps", selectedAppId, "models"],
    queryFn: () => schemaApi.listModels(selectedAppId),
    enabled: !!selectedAppId,
  });

  const { data: flows = [], isLoading: flowsLoading } = useQuery({
    queryKey: ["approvals", "flows", selectedModelId],
    queryFn: () => approvalsApi.listFlows(selectedModelId),
    enabled: !!selectedModelId,
  });

  const createFlow = useMutation({
    mutationFn: ({ name, stages }) =>
      approvalsApi.createFlow({
        name,
        model_id: selectedModelId,
        app_id: selectedAppId,
        stages: stages.map((s, i) => ({ ...s, order: i })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals", "flows", selectedModelId] });
      setCreateOpen(false);
      toast.success("Approval flow created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFlow = useMutation({
    mutationFn: ({ id, name, stages }) =>
      approvalsApi.updateFlow(id, {
        name,
        stages: stages.map((s, i) => ({ ...s, order: i })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals", "flows", selectedModelId] });
      setEditTarget(null);
      toast.success("Flow updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFlow = useMutation({
    mutationFn: (flowId) => approvalsApi.deleteFlow(flowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals", "flows", selectedModelId] });
      toast.success("Flow deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Approval Flows</h2>
        <p className="text-sm text-muted-foreground">
          Design multi-stage approval workflows for your models
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

      {/* Flows list */}
      {selectedModelId && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4" /> New Flow
            </Button>
          </div>

          {flowsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : flows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <GitBranch className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-foreground">No approval flows</p>
              <p className="text-sm text-muted-foreground">
                Create an approval flow for this model
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.map((flow) => (
                <Card key={flow.id}>
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                    <div
                      className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                      onClick={() =>
                        setExpandedFlow(expandedFlow === flow.id ? null : flow.id)
                      }
                    >
                      {expandedFlow === flow.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <CardTitle className="text-sm truncate">{flow.name}</CardTitle>
                      <Badge
                        variant={flow.is_active ? "default" : "secondary"}
                        className="text-xs shrink-0"
                      >
                        {flow.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {flow.stages?.length ?? 0} stage{(flow.stages?.length ?? 0) !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditTarget(flow)}
                        title="Edit flow"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteFlow.mutate(flow.id)}
                        title="Delete flow"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  {expandedFlow === flow.id && (
                    <CardContent className="px-4 pb-4">
                      <div className="space-y-2">
                        {(flow.stages ?? []).map((stage, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-border p-3 text-sm"
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                                {i + 1}
                              </div>
                              <span className="font-medium">{stage.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {APPROVAL_MODES.find((m) => m.value === stage.approval_mode)?.label ?? stage.approval_mode}
                              </Badge>
                            </div>
                            <div className="ml-7 space-y-0.5">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Approvers: </span>
                                {(stage.approvers ?? []).length === 0
                                  ? "None"
                                  : stage.approvers.map((a) => `${a.type}: ${a.value}`).join(" · ")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">SLA:</span> {stage.sla_hours ?? 48}h ·{" "}
                                <span className="font-medium">On breach:</span>{" "}
                                {ESCALATION_POLICIES.find((p) => p.value === stage.escalation_policy)?.label ?? stage.escalation_policy}
                              </p>
                              {stage.skip_condition && (
                                <p className="text-xs text-amber-600">
                                  <span className="font-medium">Skip if:</span>{" "}
                                  {stage.skip_condition.field} {SKIP_OPERATORS.find(o => o.value === stage.skip_condition.operator)?.label ?? stage.skip_condition.operator}
                                  {!NO_VALUE_OPERATORS.includes(stage.skip_condition.operator) && ` "${stage.skip_condition.value}"`}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Flow dialog */}
      <FlowDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Approval Flow"
        initial={null}
        onSave={(data) => createFlow.mutate(data)}
        isPending={createFlow.isPending}
      />

      {/* Edit Flow dialog */}
      {editTarget && (
        <FlowDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          title="Edit Approval Flow"
          initial={{
            name: editTarget.name,
            stages: editTarget.stages ?? [],
          }}
          onSave={(data) => updateFlow.mutate({ id: editTarget.id, ...data })}
          isPending={updateFlow.isPending}
        />
      )}
    </div>
  );
}
