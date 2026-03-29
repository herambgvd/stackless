import { useCallback, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Save, Plus, Play, X, Trash2 } from "lucide-react";
import { workflowApi } from "../api/workflow.api";
import { notificationsApi } from "@/apps/notifications/api/notifications.api";
import { approvalsApi } from "@/apps/approvals/api/approvals.api";
import { integrationsApi } from "@/apps/integrations/api/integrations.api";
import { NodePalette } from "./NodePalette";
import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

const NODE_COMPONENTS = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

// UI subtype → backend { type, event, cron_expression }
// UI subtype is the unique value used inside the node data
const TRIGGER_OPTIONS = [
  { subtype: "manual",    label: "Manual",           type: "manual",       event: null },
  { subtype: "on_create", label: "Record Created",   type: "record_event", event: "on_create" },
  { subtype: "on_update", label: "Record Updated",   type: "record_event", event: "on_update" },
  { subtype: "on_delete", label: "Record Deleted",   type: "record_event", event: "on_delete" },
  { subtype: "schedule",  label: "Scheduled (cron)", type: "schedule",     event: null },
  { subtype: "webhook",   label: "Webhook",          type: "webhook",      event: null },
];

const ACTION_TYPES = [
  { value: "set_variable",      label: "Set Variable" },
  { value: "create_record",     label: "Create Record" },
  { value: "update_record",     label: "Update Record" },
  { value: "send_notification", label: "Send Notification" },
  { value: "http_request",      label: "HTTP Request" },
  { value: "trigger_approval",  label: "Trigger Approval" },
  { value: "wait_delay",        label: "Wait / Delay" },
  { value: "conditional_branch",label: "Conditional Branch" },
  { value: "loop",              label: "Loop" },
  { value: "sub_workflow",      label: "Sub-Workflow" },
  { value: "human_task",        label: "Human Task" },
  { value: "slack_message",         label: "Slack Message" },
  { value: "send_email",            label: "Send Email (SMTP)" },
  { value: "whatsapp_send",         label: "WhatsApp" },
  { value: "stripe_create_payment", label: "Stripe Payment Link" },
  { value: "google_sheets_append",  label: "Google Sheets Append" },
];

// ── Converters ─────────────────────────────────────────────────────────────────

function triggerToSubtype(trigger) {
  if (!trigger) return "manual";
  if (trigger.type === "record_event") return trigger.event ?? "on_create";
  return trigger.type ?? "manual";
}

function subtypeToTrigger(subtype, config) {
  const opt = TRIGGER_OPTIONS.find((o) => o.subtype === subtype) ?? TRIGGER_OPTIONS[0];
  const result = { type: opt.type };
  if (opt.event) result.event = opt.event;
  if (subtype === "schedule" && config?.cron_expression)
    result.cron_expression = config.cron_expression;
  if (subtype === "webhook" && config?.webhook_secret)
    result.webhook_secret = config.webhook_secret;
  return result;
}

function workflowToFlow(workflow) {
  const nodes = [];
  const edges = [];

  if (workflow.trigger) {
    const subtype = triggerToSubtype(workflow.trigger);
    const opt = TRIGGER_OPTIONS.find((o) => o.subtype === subtype) ?? TRIGGER_OPTIONS[0];
    nodes.push({
      id: "trigger-0",
      type: "trigger",
      position: { x: 300, y: 50 },
      data: {
        label: opt.label,
        subtype,
        config: {
          cron_expression: workflow.trigger.cron_expression ?? "",
          webhook_secret: workflow.trigger.webhook_secret ?? "",
        },
      },
    });
  }

  (workflow.steps ?? []).forEach((step, i) => {
    const nodeId = step.name ?? `step-${i}`;
    const isCondition = step.type === "conditional_branch";
    nodes.push({
      id: nodeId,
      type: isCondition ? "condition" : "action",
      position: { x: 300, y: 150 + i * 120 },
      data: (() => {
        const baseConfig = step.config ?? {};
        // For condition nodes, also expose the branch condition's field/op/value
        // in config so the NodeConfigPanel can display and edit them.
        if (isCondition) {
          const cond = (step.branch_conditions ?? [])[0]?.condition ?? {};
          Object.assign(baseConfig, {
            field: cond.field ?? baseConfig.field ?? "",
            operator: cond.operator ?? baseConfig.operator ?? "eq",
            value: cond.value ?? baseConfig.value ?? "",
          });
        }
        return {
          label: step.name,
          subtype: step.type,
          config: baseConfig,
          branch_conditions: step.branch_conditions ?? [],
          next_step_id: step.next_step_id ?? null,
        };
      })(),
    });

    if (i === 0) {
      edges.push({ id: `e-trigger-${nodeId}`, source: "trigger-0", target: nodeId, animated: true });
    }

    if (isCondition) {
      // True branch: first branch_condition's next_step_id
      const trueBranch = (step.branch_conditions ?? [])[0];
      if (trueBranch?.next_step_id) {
        edges.push({
          id: `e-${nodeId}-true-${trueBranch.next_step_id}`,
          source: nodeId,
          sourceHandle: "true",
          target: trueBranch.next_step_id,
          label: "✓ true",
          labelStyle: { fill: "#16a34a", fontSize: 10 },
          animated: true,
          style: { stroke: "#16a34a" },
        });
      }
      // False / default branch: next_step_id
      if (step.next_step_id) {
        edges.push({
          id: `e-${nodeId}-false-${step.next_step_id}`,
          source: nodeId,
          sourceHandle: "false",
          target: step.next_step_id,
          label: "✗ false",
          labelStyle: { fill: "#dc2626", fontSize: 10 },
          animated: true,
          style: { stroke: "#dc2626" },
        });
      }
    } else {
      if (step.next_step_id) {
        edges.push({ id: `e-${nodeId}-${step.next_step_id}`, source: nodeId, target: step.next_step_id, animated: true });
      } else if (i > 0) {
        const prevId = workflow.steps[i - 1].name ?? `step-${i - 1}`;
        edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, animated: true });
      }
    }
  });

  return { nodes, edges };
}

function flowToWorkflow(nodes, edges, name, appId) {
  const triggerNode = nodes.find((n) => n.type === "trigger");
  const trigger = subtypeToTrigger(
    triggerNode?.data?.subtype ?? "manual",
    triggerNode?.data?.config ?? {}
  );

  // Build edge maps: default next + per-handle maps
  const nextMap = {};       // source → default target (no sourceHandle)
  const trueMap = {};       // source → true branch target
  const falseMap = {};      // source → false branch target

  edges.forEach((e) => {
    if (e.sourceHandle === "true") {
      trueMap[e.source] = e.target;
    } else if (e.sourceHandle === "false") {
      falseMap[e.source] = e.target;
    } else {
      nextMap[e.source] = e.target;
    }
  });

  const steps = nodes
    .filter((n) => n.type !== "trigger")
    .map((n, i) => {
      const isCondition = n.type === "condition";
      const step = {
        name: n.data?.label ?? n.id,
        type: n.data?.subtype ?? (isCondition ? "conditional_branch" : "set_variable"),
        config: n.data?.config ?? {},
        order: i,
        next_step_id: isCondition ? (falseMap[n.id] ?? null) : (nextMap[n.id] ?? null),
      };

      if (isCondition) {
        // Build branch condition from the edited config values in the node panel
        const cfg = n.data?.config ?? {};
        const conditionObj = {
          field: cfg.field ?? "",
          operator: cfg.operator ?? "eq",
          value: cfg.value ?? "",
        };
        const trueBranchTarget = trueMap[n.id];
        if (trueBranchTarget) {
          step.branch_conditions = [
            { condition: conditionObj, next_step_id: trueBranchTarget, label: "true" },
          ];
        } else {
          // No true edge connected yet — store condition without a target
          step.branch_conditions = [
            { condition: conditionObj, next_step_id: "", label: "true" },
          ];
        }
      }

      return step;
    });

  return { name, app_id: appId, trigger, steps };
}

// ── Node Config Panel ─────────────────────────────────────────────────────────

function ConfigField({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

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
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground shrink-0">
                {k}
              </span>
              <span className="text-muted-foreground flex-1 truncate">{String(v)}</span>
              <button
                type="button"
                onClick={() => remove(k)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input
          className="h-7 text-xs"
          placeholder="key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
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

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const CONNECTOR_SUBTYPES = [
  "slack_message",
  "send_email",
  "whatsapp_send",
  "stripe_create_payment",
  "google_sheets_append",
];

const CONNECTOR_PROVIDER_MAP = {
  slack_message: "slack",
  send_email: "smtp",
  whatsapp_send: "whatsapp",
  stripe_create_payment: "stripe",
  google_sheets_append: "google_sheets",
};

function ActionConfigFields({ subtype, config, setConfig }) {
  const { data: templates = [] } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => notificationsApi.listTemplates(),
    enabled: subtype === "send_notification",
  });

  const { data: approvalFlows = [] } = useQuery({
    queryKey: ["approval-flows"],
    queryFn: () => approvalsApi.listFlows(),
    enabled: subtype === "trigger_approval",
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => integrationsApi.list(),
    enabled: CONNECTOR_SUBTYPES.includes(subtype),
  });

  if (subtype === "create_record" || subtype === "update_record") {
    return (
      <>
        <ConfigField label="Model Slug">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. tasks"
            value={config?.model_slug ?? ""}
            onChange={(e) => setConfig("model_slug", e.target.value)}
          />
        </ConfigField>
        {subtype === "update_record" && (
          <ConfigField label="Record ID (variable)">
            <Input
              className="h-8 text-sm"
              placeholder="e.g. {{trigger.record_id}}"
              value={config?.record_id ?? ""}
              onChange={(e) => setConfig("record_id", e.target.value)}
            />
          </ConfigField>
        )}
        <ConfigField label="Field Values">
          <KeyValueEditor
            value={config?.field_map ?? {}}
            onChange={(v) => setConfig("field_map", v)}
          />
        </ConfigField>
      </>
    );
  }

  if (subtype === "send_notification") {
    return (
      <>
        <ConfigField label="Template">
          <Select
            value={config?.template_id ?? ""}
            onValueChange={(v) => setConfig("template_id", v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ConfigField>
        <ConfigField label="Recipient">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. {{trigger.created_by}}"
            value={config?.recipient ?? ""}
            onChange={(e) => setConfig("recipient", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Context">
          <KeyValueEditor
            value={config?.context ?? {}}
            onChange={(v) => setConfig("context", v)}
          />
        </ConfigField>
      </>
    );
  }

  if (subtype === "trigger_approval") {
    return (
      <>
        <ConfigField label="Approval Flow">
          <Select
            value={config?.flow_id ?? ""}
            onValueChange={(v) => setConfig("flow_id", v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select flow" />
            </SelectTrigger>
            <SelectContent>
              {approvalFlows.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ConfigField>
        <ConfigField label="Record ID (variable)">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. {{trigger.record_id}}"
            value={config?.record_id ?? ""}
            onChange={(e) => setConfig("record_id", e.target.value)}
          />
        </ConfigField>
      </>
    );
  }

  if (subtype === "http_request") {
    return (
      <>
        <ConfigField label="Method">
          <Select
            value={config?.method ?? "GET"}
            onValueChange={(v) => setConfig("method", v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ConfigField>
        <ConfigField label="URL">
          <Input
            className="h-8 text-sm"
            placeholder="https://..."
            value={config?.url ?? ""}
            onChange={(e) => setConfig("url", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Headers">
          <KeyValueEditor
            value={config?.headers ?? {}}
            onChange={(v) => setConfig("headers", v)}
          />
        </ConfigField>
        <ConfigField label="Body (JSON fields)">
          <KeyValueEditor
            value={config?.body ?? {}}
            onChange={(v) => setConfig("body", v)}
          />
        </ConfigField>
      </>
    );
  }

  if (subtype === "wait_delay") {
    return (
      <ConfigField label="Delay (seconds)">
        <Input
          className="h-8 text-sm"
          type="number"
          min={1}
          placeholder="60"
          value={config?.delay_seconds ?? ""}
          onChange={(e) => setConfig("delay_seconds", Number(e.target.value))}
        />
      </ConfigField>
    );
  }

  if (subtype === "set_variable") {
    return (
      <>
        <ConfigField label="Variable Name">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. total_price"
            value={config?.variable_name ?? ""}
            onChange={(e) => setConfig("variable_name", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Value / Expression">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. {{qty}} * {{price}}"
            value={config?.value ?? ""}
            onChange={(e) => setConfig("value", e.target.value)}
          />
        </ConfigField>
      </>
    );
  }

  if (subtype === "loop") {
    return (
      <>
        <ConfigField label="Collection Field">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. items"
            value={config?.collection_field ?? ""}
            onChange={(e) => setConfig("collection_field", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Item Variable Name">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. item"
            value={config?.item_variable ?? ""}
            onChange={(e) => setConfig("item_variable", e.target.value)}
          />
        </ConfigField>
      </>
    );
  }

  if (subtype === "human_task") {
    return (
      <>
        <ConfigField label="Task Title">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. Review and confirm order"
            value={config?.title ?? ""}
            onChange={(e) => setConfig("title", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Description">
          <Input
            className="h-8 text-sm"
            placeholder="Optional instructions for the assignee"
            value={config?.description ?? ""}
            onChange={(e) => setConfig("description", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Assignee User ID (optional)">
          <Input
            className="h-8 text-sm"
            placeholder="e.g. {{trigger.created_by}} or user id"
            value={config?.assignee_id ?? ""}
            onChange={(e) => setConfig("assignee_id", e.target.value)}
          />
        </ConfigField>
        <ConfigField label="Due in Hours (optional)">
          <Input
            className="h-8 text-sm"
            type="number"
            min={1}
            placeholder="e.g. 24"
            value={config?.due_in_hours ?? ""}
            onChange={(e) => setConfig("due_in_hours", e.target.value ? Number(e.target.value) : "")}
          />
        </ConfigField>
      </>
    );
  }

  if (CONNECTOR_SUBTYPES.includes(subtype)) {
    const matchingProvider = CONNECTOR_PROVIDER_MAP[subtype];
    const filteredIntegrations = integrations.filter(
      (i) => i.provider === matchingProvider && i.is_active
    );

    return (
      <>
        <ConfigField label="Integration">
          <Select
            value={config?.integration_id ?? ""}
            onValueChange={(v) => setConfig("integration_id", v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select integration" />
            </SelectTrigger>
            <SelectContent>
              {filteredIntegrations.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
              {filteredIntegrations.length === 0 && (
                <SelectItem value="__none__" disabled>
                  No {matchingProvider} integrations found
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </ConfigField>

        {subtype === "slack_message" && (
          <>
            <ConfigField label="Channel">
              <Input
                className="h-8 text-sm"
                placeholder="#general"
                value={config?.channel ?? ""}
                onChange={(e) => setConfig("channel", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Message">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. New order: {{order_id}}"
                value={config?.message ?? ""}
                onChange={(e) => setConfig("message", e.target.value)}
              />
            </ConfigField>
          </>
        )}

        {subtype === "send_email" && (
          <>
            <ConfigField label="To">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. {{trigger.email}}"
                value={config?.to ?? ""}
                onChange={(e) => setConfig("to", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Subject">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. Your order {{order_id}}"
                value={config?.subject ?? ""}
                onChange={(e) => setConfig("subject", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Body">
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                placeholder="Email body..."
                value={config?.body ?? ""}
                onChange={(e) => setConfig("body", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="HTML Email">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_html"
                  checked={config?.is_html ?? false}
                  onChange={(e) => setConfig("is_html", e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="is_html" className="text-sm text-muted-foreground">
                  Send as HTML
                </label>
              </div>
            </ConfigField>
          </>
        )}

        {subtype === "whatsapp_send" && (
          <>
            <ConfigField label="To (phone number)">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. +15551234567"
                value={config?.to ?? ""}
                onChange={(e) => setConfig("to", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Message">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. Hello {{name}}"
                value={config?.message ?? ""}
                onChange={(e) => setConfig("message", e.target.value)}
              />
            </ConfigField>
          </>
        )}

        {subtype === "stripe_create_payment" && (
          <>
            <ConfigField label="Amount">
              <Input
                className="h-8 text-sm"
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 49.99"
                value={config?.amount ?? ""}
                onChange={(e) => setConfig("amount", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Currency">
              <Input
                className="h-8 text-sm"
                placeholder="usd"
                value={config?.currency ?? "usd"}
                onChange={(e) => setConfig("currency", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Product Name">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. {{product_name}}"
                value={config?.product_name ?? ""}
                onChange={(e) => setConfig("product_name", e.target.value)}
              />
            </ConfigField>
          </>
        )}

        {subtype === "google_sheets_append" && (
          <>
            <ConfigField label="Spreadsheet ID">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. 1BxiMVs0XRA..."
                value={config?.spreadsheet_id ?? ""}
                onChange={(e) => setConfig("spreadsheet_id", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Sheet Name">
              <Input
                className="h-8 text-sm"
                placeholder="Sheet1"
                value={config?.sheet_name ?? "Sheet1"}
                onChange={(e) => setConfig("sheet_name", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Values (comma-separated)">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. {{name}}, {{email}}, {{amount}}"
                value={Array.isArray(config?.values) ? config.values.join(", ") : (config?.values ?? "")}
                onChange={(e) =>
                  setConfig(
                    "values",
                    e.target.value.split(",").map((v) => v.trim()).filter(Boolean)
                  )
                }
              />
            </ConfigField>
          </>
        )}
      </>
    );
  }

  // Fallback: generic key-value config
  return (
    <ConfigField label="Config">
      <KeyValueEditor
        value={config ?? {}}
        onChange={(v) => setConfig("__kv__", v)}
      />
    </ConfigField>
  );
}

function NodeConfigPanel({ node, onUpdate, onDelete, onClose, workflows }) {
  if (!node) return null;

  const data = node.data ?? {};
  const isTrigger = node.type === "trigger";
  const isCondition = node.type === "condition";

  function set(key, val) {
    onUpdate(node.id, { ...data, [key]: val });
  }

  function setConfig(key, val) {
    onUpdate(node.id, { ...data, config: { ...(data.config ?? {}), [key]: val } });
  }

  return (
    <div className="w-64 shrink-0 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isTrigger ? "bg-green-500" : isCondition ? "bg-amber-500" : "bg-blue-500"
            }`}
          />
          <span className="text-sm font-medium text-foreground">
            {isTrigger ? "Trigger" : isCondition ? "Condition" : "Action"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isTrigger && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="text-muted-foreground hover:text-destructive p-1 rounded"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label / Name */}
        <ConfigField label="Label">
          <Input
            className="h-8 text-sm"
            value={data.label ?? ""}
            onChange={(e) => set("label", e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </ConfigField>

        {/* Trigger-specific */}
        {isTrigger && (
          <ConfigField label="Trigger Event">
            <Select
              value={data.subtype ?? "manual"}
              onValueChange={(v) => set("subtype", v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((o) => (
                  <SelectItem key={o.subtype} value={o.subtype}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data.subtype === "schedule" && (
              <Input
                className="h-8 text-sm mt-2"
                placeholder="Cron expression (e.g. 0 9 * * 1)"
                value={data.config?.cron_expression ?? ""}
                onChange={(e) => setConfig("cron_expression", e.target.value)}
              />
            )}
            {data.subtype === "webhook" && (
              <Input
                className="h-8 text-sm mt-2"
                placeholder="Webhook secret (optional)"
                value={data.config?.webhook_secret ?? ""}
                onChange={(e) => setConfig("webhook_secret", e.target.value)}
              />
            )}
          </ConfigField>
        )}

        {/* Action type selector */}
        {!isTrigger && !isCondition && (
          <ConfigField label="Action Type">
            <Select
              value={data.subtype ?? "set_variable"}
              onValueChange={(v) => set("subtype", v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ConfigField>
        )}

        {/* Sub-workflow selector */}
        {data.subtype === "sub_workflow" && (
          <ConfigField label="Workflow">
            <Select
              value={data.config?.workflow_id ?? ""}
              onValueChange={(v) => setConfig("workflow_id", v)}
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
          </ConfigField>
        )}

        {/* Condition-specific */}
        {isCondition && (
          <>
            <ConfigField label="Field">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. status"
                value={data.config?.field ?? ""}
                onChange={(e) => setConfig("field", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Operator">
              <Select
                value={data.config?.operator ?? "eq"}
                onValueChange={(v) => setConfig("operator", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"].map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ConfigField>
            <ConfigField label="Value">
              <Input
                className="h-8 text-sm"
                placeholder="e.g. active"
                value={data.config?.value ?? ""}
                onChange={(e) => setConfig("value", e.target.value)}
              />
            </ConfigField>
          </>
        )}

        {/* Action type-specific config fields */}
        {!isTrigger && !isCondition && data.subtype !== "sub_workflow" && (
          <ActionConfigFields
            subtype={data.subtype ?? "set_variable"}
            config={data.config ?? {}}
            setConfig={setConfig}
          />
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function FlowDesignerPage() {
  const { appId } = useParams({ from: "/_authenticated/apps/$appId/flow" });
  const qc = useQueryClient();
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowId, setWorkflowId] = useState(null);
  const [workflowName, setWorkflowName] = useState("New Workflow");
  const [selectedNode, setSelectedNode] = useState(null);

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows", appId],
    queryFn: () => workflowApi.listWorkflows(appId),
  });

  // Load selected workflow into canvas
  function loadWorkflow(wf) {
    setWorkflowId(wf.id);
    setWorkflowName(wf.name);
    setSelectedNode(null);
    const { nodes: n, edges: e } = workflowToFlow(wf);
    setNodes(n);
    setEdges(e);
  }

  // Auto-load first workflow on mount
  useEffect(() => {
    const wf = workflows.find((w) => w.app_id === appId) ?? workflows[0];
    if (wf && !workflowId) {
      loadWorkflow(wf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows]);

  const save = useMutation({
    mutationFn: () => {
      const payload = flowToWorkflow(nodes, edges, workflowName, appId);
      if (workflowId) return workflowApi.updateWorkflow(workflowId, payload);
      return workflowApi.createWorkflow(payload);
    },
    onSuccess: (data) => {
      if (data?.id) setWorkflowId(data.id);
      qc.invalidateQueries({ queryKey: ["workflows", appId] });
      toast.success("Workflow saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const trigger = useMutation({
    mutationFn: () => workflowApi.triggerWorkflow(workflowId),
    onSuccess: () => toast.success("Workflow triggered"),
    onError: (e) => toast.error(e.message),
  });

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/flowforge-node");
      if (!raw) return;
      const nodeData = JSON.parse(raw);
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const position = {
        x: e.clientX - (bounds?.left ?? 0) - 90,
        y: e.clientY - (bounds?.top ?? 0) - 30,
      };
      const newNode = {
        id: crypto.randomUUID(),
        type: nodeData.type,
        position,
        data: { label: nodeData.label, subtype: nodeData.subtype, config: {} },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  const onAddNode = useCallback(
    (nodeData) => {
      const newNode = {
        id: crypto.randomUUID(),
        type: nodeData.type,
        position: { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
        data: { label: nodeData.label, subtype: nodeData.subtype, config: {} },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  // Click on node → open config panel
  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
  }, []);

  // Click on canvas → close panel
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Update node data from config panel
  function updateNodeData(nodeId, newData) {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n))
    );
    setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data: newData } : prev));
  }

  // Delete node from config panel
  function deleteNode(nodeId) {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left palette */}
      <div className="w-52 shrink-0">
        <NodePalette onAddNode={onAddNode} />
      </div>

      {/* Flow canvas */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 rounded-xl border border-border overflow-hidden"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_COMPONENTS}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "hsl(var(--primary))" },
          }}
        >
          <Background gap={16} color="hsl(var(--muted-foreground)/0.15)" />
          <Controls className="rounded-lg border border-border shadow-sm" />
          <MiniMap
            className="rounded-lg border border-border shadow-sm"
            nodeColor={(n) =>
              n.type === "trigger" ? "#22c55e" : n.type === "condition" ? "#f59e0b" : "#3b82f6"
            }
          />

          {/* Top toolbar */}
          <Panel position="top-right" className="flex items-center gap-2">
            {/* Workflow selector */}
            {workflows.length > 0 && (
              <Select
                value={workflowId ?? ""}
                onValueChange={(v) => {
                  if (v === "__new__") {
                    setWorkflowId(null);
                    setWorkflowName("New Workflow");
                    setNodes([]);
                    setEdges([]);
                    setSelectedNode(null);
                  } else {
                    const wf = workflows.find((w) => w.id === v);
                    if (wf) loadWorkflow(wf);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-44 text-sm">
                  <SelectValue placeholder="Select workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      {wf.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ New workflow</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="h-8 w-44 text-sm"
              placeholder="Workflow name"
            />

            {workflowId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => trigger.mutate()}
                disabled={trigger.isPending}
                title="Trigger this workflow"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}

            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" />
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Right config panel */}
      <NodeConfigPanel
        node={selectedNode}
        onUpdate={updateNodeData}
        onDelete={deleteNode}
        onClose={() => setSelectedNode(null)}
        workflows={workflows}
      />
    </div>
  );
}
