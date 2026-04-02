import { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Save, Plus, Pencil, Trash2, MoreHorizontal, Database, ShieldCheck, Webhook, Copy, Check, Printer, GitBranch, X } from "lucide-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { schemaApi } from "../api/schema.api";
import { webhookApi } from "../api/webhook.api";
import { printFormatsApi, letterHeadApi } from "../api/print-formats.api";
import { FieldPalette } from "./FieldPalette";
import { FormCanvas } from "./FormCanvas";
import { FieldConfig } from "./FieldConfig";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { Checkbox } from "@/shared/components/ui/checkbox";

export function AppBuilderPage() {
  const confirm = useConfirm();
  const { appId } = useParams({ from: "/_authenticated/apps/$appId/builder" });
  const qc = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeModelId, setActiveModelId] = useState(null);
  const [fields, setFields] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [createModelOpen, setCreateModelOpen] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelPluralName, setNewModelPluralName] = useState("");
  const [newModelIcon, setNewModelIcon] = useState("table");
  const [newModelDescription, setNewModelDescription] = useState("");
  const [newModelOrder, setNewModelOrder] = useState(1);
  const [renameModelOpen, setRenameModelOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null); // { id, name, plural_name, icon, description }
  const [renameValue, setRenameValue] = useState("");
  const [renamePluralValue, setRenamePluralValue] = useState("");
  const [renameIconValue, setRenameIconValue] = useState("table");
  const [renameDescValue, setRenameDescValue] = useState("");
  const [renameSubmittable, setRenameSubmittable] = useState(false);
  const [renameNamingSeries, setRenameNamingSeries] = useState("");
  const [deleteModelTarget, setDeleteModelTarget] = useState(null); // { id, name }
  const [indexModelTarget, setIndexModelTarget] = useState(null); // model object for index management
  const [indexes, setIndexes] = useState([]); // list of { fields: string[], unique: bool, sparse: bool }
  const [permModelTarget, setPermModelTarget] = useState(null); // model object for permission matrix
  const [permissions, setPermissions] = useState([]); // list of { role, read, write, create, delete, submit }
  const [userPermissions, setUserPermissions] = useState([]); // list of { role, field_name, based_on_user_field }
  const [webhookModelTarget, setWebhookModelTarget] = useState(null); // model object for webhook management
  const [newWebhookLabel, setNewWebhookLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState(null);
  const [editingWebhookId, setEditingWebhookId] = useState(null); // id of webhook whose field_map is being edited
  const [editingFieldMap, setEditingFieldMap] = useState([]); // [{ key, value }]
  const [printFormatModelTarget, setPrintFormatModelTarget] = useState(null);
  const [editingFormat, setEditingFormat] = useState(null); // null | { id, name, html_template } | "new"
  const [formatName, setFormatName] = useState("");
  const [formatTemplate, setFormatTemplate] = useState("");
  const [formatLetterHeadId, setFormatLetterHeadId] = useState("");
  const [workflowStatesTarget, setWorkflowStatesTarget] = useState(null); // model for workflow states editor
  const [workflowStates, setWorkflowStates] = useState([]); // [{name, label, color, is_initial, transitions}]

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: models = [], isLoading } = useQuery({
    queryKey: ["apps", appId, "models"],
    queryFn: () => schemaApi.listModels(appId),
  });

  // Auto-select first model on first load
  useEffect(() => {
    if (models.length > 0 && !activeModelId) {
      setActiveModelId(models[0].id);
    }
  }, [models]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeModel = models.find((m) => m.id === activeModelId) ?? null;

  // Load fields whenever active model changes
  useEffect(() => {
    if (activeModel) {
      setFields(
        activeModel.fields.map((f, i) => ({
          ...f,
          id: f.name, // use field name as stable local key
          order: f.order ?? i,
        })),
      );
      setSelectedFieldId(null);
      setDirty(false);
    } else {
      setFields([]);
    }
  }, [activeModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch model (with unsaved-changes guard) ──────────────────────────────
  const switchModel = async (modelId) => {
    if (dirty) {
      if (!await confirm({ title: "Unsaved Changes", message: "You have unsaved changes. Switch model anyway?", confirmLabel: "Switch" })) return;
    }
    setActiveModelId(modelId);
  };

  // ── Rename model mutation ──────────────────────────────────────────────────
  const renameModel = useMutation({
    mutationFn: () =>
      schemaApi.updateModel(appId, renameTarget.id, {
        name: renameValue.trim(),
        plural_name: renamePluralValue.trim() || undefined,
        icon: renameIconValue.trim() || "table",
        description: renameDescValue.trim() || undefined,
        is_submittable: renameSubmittable,
        naming_series: renameNamingSeries.trim() || undefined,
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      setRenameModelOpen(false);
      setRenameTarget(null);
      toast.success(`Model "${updated.name}" updated`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Workflow states mutation ───────────────────────────────────────────────
  const saveWorkflowStates = useMutation({
    mutationFn: () =>
      schemaApi.updateModel(appId, workflowStatesTarget.id, { workflow_states: workflowStates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      setWorkflowStatesTarget(null);
      toast.success("Workflow states saved");
    },
    onError: (e) => toast.error(e.message ?? "Failed to save workflow states"),
  });

  // ── Delete model mutation ──────────────────────────────────────────────────
  const deleteModel = useMutation({
    mutationFn: (modelId) => schemaApi.deleteModel(appId, modelId),
    onSuccess: (_, modelId) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      if (activeModelId === modelId) setActiveModelId(null);
      setDeleteModelTarget(null);
      toast.success("Model deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Create model mutation ──────────────────────────────────────────────────
  const createModel = useMutation({
    mutationFn: () =>
      schemaApi.createModel(appId, {
        name: newModelName.trim(),
        plural_name: newModelPluralName.trim() || undefined,
        icon: newModelIcon.trim() || "table",
        order: newModelOrder,
        // Pre-create a "name" text field so the model isn't completely empty
        fields: [
          {
            name: "name",
            label: "Name",
            type: "text",
            config: {},
            order: 0,
            is_required: true,
            is_searchable: true,
            is_filterable: true,
            is_sortable: true,
            default_value: null,
          },
        ],
      }),
    onSuccess: (model) => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      setActiveModelId(model.id);
      setDirty(false);
      setCreateModelOpen(false);
      setNewModelName("");
      setNewModelPluralName("");
      setNewModelIcon("table");
      setNewModelDescription("");
      setNewModelOrder(models.length + 1);
      toast.success(`Model "${model.name}" created`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Save indexes mutation ──────────────────────────────────────────────────
  const saveIndexes = useMutation({
    mutationFn: () =>
      schemaApi.updateModel(appId, indexModelTarget.id, { indexes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      setIndexModelTarget(null);
      toast.success("Indexes saved");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Save permissions mutation ──────────────────────────────────────────────
  const savePermissions = useMutation({
    mutationFn: () =>
      schemaApi.updateModel(appId, permModelTarget.id, { permissions, user_permissions: userPermissions }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      setPermModelTarget(null);
      toast.success("Permissions saved");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Webhook queries and mutations ─────────────────────────────────────────
  const { data: webhooks = [] } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => webhookApi.list(),
    enabled: !!webhookModelTarget,
  });

  const webhooksForModel = webhooks.filter(
    (wh) => wh.app_id === appId && wh.model_slug === webhookModelTarget?.slug,
  );

  const createWebhook = useMutation({
    mutationFn: () =>
      webhookApi.create({
        app_id: appId,
        model_slug: webhookModelTarget.slug,
        label: newWebhookLabel.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setNewWebhookLabel("");
      toast.success("Webhook created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteWebhook = useMutation({
    mutationFn: (hookId) => webhookApi.delete(hookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleWebhook = useMutation({
    mutationFn: (hookId) => webhookApi.toggle(hookId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
    onError: (e) => toast.error(e.message),
  });

  const updateWebhook = useMutation({
    mutationFn: ({ hookId, data }) => webhookApi.update(hookId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setEditingWebhookId(null);
      toast.success("Webhook updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const startEditingFieldMap = (wh) => {
    const entries = Object.entries(wh.field_map || {}).map(([key, value]) => ({ key, value }));
    setEditingFieldMap(entries.length > 0 ? entries : [{ key: "", value: "" }]);
    setEditingWebhookId(wh.id);
  };

  const saveFieldMap = (hookId) => {
    const field_map = {};
    for (const { key, value } of editingFieldMap) {
      if (key.trim()) field_map[key.trim()] = value.trim();
    }
    updateWebhook.mutate({ hookId, data: { field_map } });
  };

  const copyWebhookUrl = (token) => {
    const url = `${window.location.origin}/api/v1/webhooks/inbound/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    }).catch(() => {});
  };

  // ── Print format queries and mutations ────────────────────────────────────
  const { data: printFormats = [] } = useQuery({
    queryKey: ["print-formats", appId, printFormatModelTarget?.slug],
    queryFn: () => printFormatsApi.list(appId, printFormatModelTarget.slug),
    enabled: !!printFormatModelTarget,
  });

  const { data: letterHeads = [] } = useQuery({
    queryKey: ["letter-heads"],
    queryFn: () => letterHeadApi.list(),
    staleTime: 60_000,
  });

  const savePrintFormat = useMutation({
    mutationFn: () => {
      const data = {
        name: formatName.trim(),
        html_template: formatTemplate,
        letter_head_id: formatLetterHeadId || null,
      };
      if (editingFormat === "new") {
        return printFormatsApi.create(appId, printFormatModelTarget.slug, data);
      }
      return printFormatsApi.update(appId, printFormatModelTarget.slug, editingFormat.id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["print-formats", appId, printFormatModelTarget?.slug] });
      setEditingFormat(null);
      setFormatName("");
      setFormatTemplate("");
      setFormatLetterHeadId("");
      toast.success("Print format saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePrintFormat = useMutation({
    mutationFn: (formatId) => printFormatsApi.delete(appId, printFormatModelTarget.slug, formatId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["print-formats", appId, printFormatModelTarget?.slug] });
      toast.success("Print format deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Save schema mutation ───────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () => {
      if (!activeModel) return Promise.reject(new Error("No model selected"));
      const backendFields = fields.map((f, i) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        config: f.config ?? {},
        order: f.order ?? i,
        is_required: f.is_required ?? false,
        is_searchable: f.is_searchable ?? false,
        is_filterable: f.is_filterable ?? true,
        is_sortable: f.is_sortable ?? true,
        default_value: f.default_value ?? null,
      }));
      return schemaApi.updateModel(appId, activeModel.id, { fields: backendFields });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps", appId, "models"] });
      setDirty(false);
      toast.success("Schema saved");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Field operations ───────────────────────────────────────────────────────
  const addField = useCallback((fieldType) => {
    const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const newField = {
      id: uid,
      name: `${fieldType}_${uid}`,
      label: `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1).toLowerCase()} field`,
      type: fieldType,
      config: {},
      order: 0,
      is_required: false,
      is_searchable: false,
      is_filterable: true,
      is_sortable: true,
      default_value: null,
    };
    setFields((prev) => [...prev, { ...newField, order: prev.length }]);
    setSelectedFieldId(newField.id);
    setDirty(true);
  }, []);

  const updateField = useCallback((id, updates) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    if (updates.id && updates.id !== id) {
      setSelectedFieldId(updates.id);
    }
    setDirty(true);
  }, []);

  const removeField = useCallback(
    (id) => {
      setFields((prev) => prev.filter((f) => f.id !== id));
      if (selectedFieldId === id) setSelectedFieldId(null);
      setDirty(true);
    },
    [selectedFieldId],
  );

  const moveField = useCallback((fromIndex, toIndex) => {
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((f, i) => ({ ...f, order: i }));
    });
    setDirty(true);
  }, []);

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) return <Skeleton className="h-[80vh] rounded-xl" />;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col h-[calc(100vh-8rem)]">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">Schema Builder</h2>
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending || !activeModel}
            size="sm"
          >
            <Save className="h-4 w-4 mr-1" />
            {save.isPending ? "Saving…" : "Save schema"}
          </Button>
        </div>

        {/* ── Model tabs ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 flex-wrap">
          {models.map((model) => {
            const isActive = activeModelId === model.id;
            return (
              <div key={model.id} className="flex items-center shrink-0">
                <button
                  onClick={() => switchModel(model.id)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors border",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary rounded-l-md"
                      : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-primary/50 rounded-md",
                  )}
                >
                  {model.name}
                  <span className="ml-1.5 text-xs opacity-60">{model.fields?.length ?? 0}f</span>
                </button>
                {isActive && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-[34px] px-1.5 border border-l-0 border-primary bg-primary text-primary-foreground rounded-r-md hover:bg-primary/90 transition-colors"
                        title="Model options"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget({ id: model.id, name: model.name });
                          setRenameValue(model.name);
                          setRenamePluralValue(model.plural_name ?? "");
                          setRenameIconValue(model.icon ?? "table");
                          setRenameDescValue(model.description ?? "");
                          setRenameSubmittable(model.is_submittable ?? false);
                          setRenameNamingSeries(model.naming_series ?? "");
                          setRenameModelOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Edit model
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setIndexes(model.indexes ?? []);
                          setIndexModelTarget(model);
                        }}
                      >
                        <Database className="h-3.5 w-3.5 mr-2" />
                        Manage indexes
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setPermissions(model.permissions ?? []);
                          setUserPermissions(model.user_permissions ?? []);
                          setPermModelTarget(model);
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                        Role permissions
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setWorkflowStates(
                            (model.workflow_states ?? []).map((s) => ({
                              ...s,
                              transitions: s.transitions ?? [],
                            }))
                          );
                          setWorkflowStatesTarget(model);
                        }}
                      >
                        <GitBranch className="h-3.5 w-3.5 mr-2" />
                        Workflow states
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setWebhookModelTarget(model);
                          setNewWebhookLabel("");
                        }}
                      >
                        <Webhook className="h-3.5 w-3.5 mr-2" />
                        Inbound webhooks
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setPrintFormatModelTarget(model);
                          setEditingFormat(null);
                        }}
                      >
                        <Printer className="h-3.5 w-3.5 mr-2" />
                        Print formats
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteModelTarget({ id: model.id, name: model.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete model
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 shrink-0"
            onClick={() => {
              setNewModelOrder(models.length + 1);
              setCreateModelOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Model
          </Button>
        </div>

        {/* ── No models empty state ─────────────────────────────────────────── */}
        {models.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 text-center p-10">
            <div className="text-4xl mb-3">🗂️</div>
            <p className="text-base font-semibold text-foreground mb-1">No models yet</p>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs">
              A <strong>model</strong> is a data table. For example, in an Inventory app
              you would create models: <em>Category</em>, <em>Product</em>, <em>Supplier</em>.
            </p>
            <Button onClick={() => { setNewModelOrder(1); setCreateModelOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Create first model
            </Button>
          </div>
        ) : (
          /* ── Three-panel layout ──────────────────────────────────────────── */
          <div className="flex flex-1 gap-4 overflow-hidden">
            {/* Left: Field palette */}
            <div className="w-56 shrink-0">
              <FieldPalette onAddField={addField} />
            </div>

            {/* Center: Canvas */}
            <div className="flex-1 overflow-y-auto">
              {activeModel ? (
                <FormCanvas
                  modelName={activeModel.name}
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  onSelectField={setSelectedFieldId}
                  onRemoveField={removeField}
                  onMoveField={moveField}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 text-center p-8">
                  <p className="text-sm text-muted-foreground">Select a model tab to edit its fields</p>
                </div>
              )}
            </div>

            {/* Right: Config panel */}
            <div className="w-80 shrink-0 overflow-y-auto border-l border-border pl-4">
              <FieldConfig
                field={selectedField}
                allModels={models}
                currentAppId={appId}
                onUpdate={(updates) => selectedField && updateField(selectedField.id, updates)}
              />
            </div>
          </div>
        )}

        {/* ── Edit Model Dialog ────────────────────────────────────────────── */}
        <Dialog open={renameModelOpen} onOpenChange={setRenameModelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit model</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Plural name</Label>
                <Input
                  value={renamePluralValue}
                  onChange={(e) => setRenamePluralValue(e.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Icon (lucide name)</Label>
                <Input
                  value={renameIconValue}
                  onChange={(e) => setRenameIconValue(e.target.value)}
                  placeholder="table"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={renameDescValue}
                  onChange={(e) => setRenameDescValue(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Naming Series</Label>
                <Input
                  value={renameNamingSeries}
                  onChange={(e) => setRenameNamingSeries(e.target.value)}
                  placeholder="e.g. INV-.YYYY.-.####"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generates IDs like <code>INV-2024-00001</code>.
                  Tokens: <code>.YYYY.</code> <code>.MM.</code> <code>.DD.</code> <code>.####.</code> (# count = zero-padding).
                  Leave blank to use MongoDB ObjectId.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Enable Submit / Cancel / Amend</p>
                  <p className="text-xs text-muted-foreground">
                    Records go through Draft → Submitted → Cancelled workflow (like invoices, POs)
                  </p>
                </div>
                <Switch
                  checked={renameSubmittable}
                  onCheckedChange={setRenameSubmittable}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameModelOpen(false)}>Cancel</Button>
              <Button
                onClick={() => renameModel.mutate()}
                disabled={!renameValue.trim() || renameModel.isPending}
              >
                {renameModel.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Model Dialog ──────────────────────────────────────────── */}
        <Dialog
          open={!!deleteModelTarget}
          onOpenChange={(v) => !v && setDeleteModelTarget(null)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete "{deleteModelTarget?.name}"?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This permanently deletes the model definition. Existing records in this model's
              collection are <strong>not</strong> deleted automatically.
            </p>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDeleteModelTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteModel.mutate(deleteModelTarget.id)}
                disabled={deleteModel.isPending}
              >
                {deleteModel.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Create Model Dialog ──────────────────────────────────────────── */}
        <Dialog open={createModelOpen} onOpenChange={setCreateModelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create new model</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="model-name">Model name *</Label>
                <Input
                  id="model-name"
                  placeholder="e.g. Category, Product, Invoice"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newModelName.trim()) createModel.mutate();
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-plural">Plural name</Label>
                <Input
                  id="model-plural"
                  placeholder="Auto-generated (e.g. Products)"
                  value={newModelPluralName}
                  onChange={(e) => setNewModelPluralName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-icon">Icon (lucide name)</Label>
                <Input
                  id="model-icon"
                  placeholder="table"
                  value={newModelIcon}
                  onChange={(e) => setNewModelIcon(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Any lucide-react icon name, e.g. <code className="bg-muted px-1 rounded">package</code>, <code className="bg-muted px-1 rounded">users</code>, <code className="bg-muted px-1 rounded">file-text</code>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-desc">Description</Label>
                <Input
                  id="model-desc"
                  placeholder="Optional description"
                  value={newModelDescription}
                  onChange={(e) => setNewModelDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-order">Position in menu</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="model-order"
                    type="number"
                    min={1}
                    className="w-24"
                    value={newModelOrder}
                    onChange={(e) => setNewModelOrder(Number(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current models: {models.length}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A default <code className="bg-muted px-1 rounded">name</code> field is added automatically.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateModelOpen(false); setNewModelName(""); setNewModelPluralName(""); setNewModelIcon("table"); setNewModelDescription(""); }}>
                Cancel
              </Button>
              <Button
                onClick={() => createModel.mutate()}
                disabled={!newModelName.trim() || createModel.isPending}
              >
                {createModel.isPending ? "Creating…" : "Create model"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Manage Indexes Dialog ─────────────────────────────────────────── */}
        <Dialog open={!!indexModelTarget} onOpenChange={(v) => !v && setIndexModelTarget(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Manage indexes — {indexModelTarget?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Custom MongoDB indexes for faster queries. Each index is a comma-separated list of field names.
              </p>
              {indexes.map((idx, i) => (
                <div key={idx._uid ?? i} className="flex items-start gap-2 rounded-lg border border-border p-3 bg-muted/30">
                  <div className="flex-1 space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fields (comma-separated)</Label>
                      <Input
                        value={(idx.fields ?? []).join(", ")}
                        onChange={(e) => {
                          const updated = [...indexes];
                          updated[i] = { ...idx, fields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) };
                          setIndexes(updated);
                        }}
                        placeholder="e.g. status, created_at"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <Switch
                          checked={idx.unique ?? false}
                          onCheckedChange={(v) => {
                            const updated = [...indexes];
                            updated[i] = { ...idx, unique: v };
                            setIndexes(updated);
                          }}
                        />
                        Unique
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <Switch
                          checked={idx.sparse ?? false}
                          onCheckedChange={(v) => {
                            const updated = [...indexes];
                            updated[i] = { ...idx, sparse: v };
                            setIndexes(updated);
                          }}
                        />
                        Sparse
                      </label>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => setIndexes(indexes.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setIndexes([...indexes, { _uid: crypto.randomUUID(), fields: [], unique: false, sparse: false }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add index
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIndexModelTarget(null)}>Cancel</Button>
              <Button onClick={() => saveIndexes.mutate()} disabled={saveIndexes.isPending}>
                {saveIndexes.isPending ? "Saving…" : "Save indexes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* ── Role Permissions Dialog ───────────────────────────────────────── */}
        <Dialog open={!!permModelTarget} onOpenChange={(v) => !v && setPermModelTarget(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Role permissions — {permModelTarget?.name}</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-xs text-muted-foreground">
                If no rows are configured, all authenticated users have full access (open by default).
                Platform superadmins always bypass these checks.
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-3 py-2 font-medium">Role</th>
                      {["read", "write", "create", "delete", "submit"].map((action) => (
                        <th key={action} className="px-3 py-2 font-medium text-center capitalize w-16">
                          {action}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium text-center w-20" title="Max field perm_level this role can access">
                        Perm Lvl
                      </th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center text-muted-foreground py-4 text-xs">
                          No role rows yet — add one below
                        </td>
                      </tr>
                    )}
                    {permissions.map((perm, i) => (
                      <tr key={perm.role || i} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <Input
                            value={perm.role}
                            onChange={(e) => {
                              const updated = [...permissions];
                              updated[i] = { ...perm, role: e.target.value };
                              setPermissions(updated);
                            }}
                            placeholder="e.g. Manager"
                            className="h-7 text-sm"
                          />
                        </td>
                        {["read", "write", "create", "delete", "submit"].map((action) => (
                          <td key={action} className="px-3 py-2 text-center">
                            <Checkbox
                              checked={!!perm[action]}
                              onCheckedChange={(v) => {
                                const updated = [...permissions];
                                updated[i] = { ...perm, [action]: !!v };
                                setPermissions(updated);
                              }}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={9}
                            value={perm.perm_level ?? 0}
                            onChange={(e) => {
                              const updated = [...permissions];
                              updated[i] = { ...perm, perm_level: Math.min(9, Math.max(0, Number(e.target.value) || 0)) };
                              setPermissions(updated);
                            }}
                            className="h-7 w-14 text-sm text-center"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setPermissions(permissions.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setPermissions([
                    ...permissions,
                    { role: "", read: true, write: false, create: false, delete: false, submit: false, perm_level: 0 },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add role
              </Button>

              {/* ── User Permissions (Row-Level Security) ──────────────────── */}
              <div className="pt-2 border-t border-border space-y-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">User Permissions (Row-Level Security)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Restrict records visible to a role based on the current user's value.
                    E.g. "Sales User" can only see records where <code>owner = current_user_id</code>.
                  </p>
                </div>
                {userPermissions.map((up, i) => (
                  <div key={up.role || i} className="flex items-center gap-2 rounded-md border border-border p-2 bg-muted/20">
                    <Input
                      value={up.role}
                      onChange={(e) => {
                        const updated = [...userPermissions];
                        updated[i] = { ...up, role: e.target.value };
                        setUserPermissions(updated);
                      }}
                      placeholder="Role"
                      className="h-7 text-sm w-28 shrink-0"
                    />
                    <Input
                      value={up.field_name}
                      onChange={(e) => {
                        const updated = [...userPermissions];
                        updated[i] = { ...up, field_name: e.target.value };
                        setUserPermissions(updated);
                      }}
                      placeholder="Record field"
                      className="h-7 text-sm font-mono flex-1"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">=</span>
                    <select
                      value={up.based_on_user_field ?? "id"}
                      onChange={(e) => {
                        const updated = [...userPermissions];
                        updated[i] = { ...up, based_on_user_field: e.target.value };
                        setUserPermissions(updated);
                      }}
                      className="h-7 text-sm rounded-md border border-input bg-background px-2 shrink-0"
                    >
                      <option value="id">user.id</option>
                      <option value="email">user.email</option>
                      <option value="tenant_id">user.tenant_id</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => setUserPermissions(userPermissions.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setUserPermissions([
                      ...userPermissions,
                      { role: "", field_name: "", based_on_user_field: "id" },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add user permission
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPermModelTarget(null)}>Cancel</Button>
              <Button onClick={() => savePermissions.mutate()} disabled={savePermissions.isPending}>
                {savePermissions.isPending ? "Saving…" : "Save permissions"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Print Formats Dialog ─────────────────────────────────────────── */}
        <Dialog open={!!printFormatModelTarget} onOpenChange={(v) => !v && setPrintFormatModelTarget(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Print formats — {printFormatModelTarget?.name}</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <p className="text-xs text-muted-foreground">
                Design HTML templates for printing records. Use <code className="bg-muted px-1 rounded">{"{{ field_name }}"}</code> to insert record values.
                Special variables: <code className="bg-muted px-1 rounded">_model_name</code>, <code className="bg-muted px-1 rounded">_printed_at</code>.
              </p>

              {editingFormat ? (
                /* ── Editor view ── */
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Format name *</Label>
                    <Input
                      value={formatName}
                      onChange={(e) => setFormatName(e.target.value)}
                      placeholder="e.g. Standard Invoice"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Letter Head (optional)</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formatLetterHeadId}
                      onChange={(e) => setFormatLetterHeadId(e.target.value)}
                    >
                      <option value="">— No letter head —</option>
                      {letterHeads.map((lh) => (
                        <option key={lh.id} value={lh.id}>{lh.name}</option>
                      ))}
                    </select>
                    {letterHeads.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No letter heads yet. Create one in Settings → Letter Heads.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>HTML template</Label>
                    <textarea
                      value={formatTemplate}
                      onChange={(e) => setFormatTemplate(e.target.value)}
                      className="w-full h-72 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={`<h1>{{ name }}</h1>\n<p>Status: {{ status }}</p>\n<table>\n  <tr><th>Field</th><th>Value</th></tr>\n</table>`}
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Standard HTML + Jinja2. The page auto-triggers <code className="bg-muted px-1 rounded">window.print()</code> on load.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => savePrintFormat.mutate()}
                      disabled={!formatName.trim() || savePrintFormat.isPending}
                    >
                      {savePrintFormat.isPending ? "Saving…" : "Save format"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditingFormat(null); setFormatName(""); setFormatTemplate(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── List view ── */
                <div className="space-y-2">
                  {printFormats.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No print formats yet</p>
                  )}
                  {printFormats.map((pf) => (
                    <div key={pf.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Printer className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{pf.name}</span>
                        {pf.is_default && <span className="text-xs text-primary">(default)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingFormat(pf);
                            setFormatName(pf.name);
                            setFormatTemplate(pf.html_template);
                            setFormatLetterHeadId(pf.letter_head_id ?? "");
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deletePrintFormat.mutate(pf.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => { setEditingFormat("new"); setFormatName(""); setFormatTemplate(""); }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New print format
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrintFormatModelTarget(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Inbound Webhooks Dialog ───────────────────────────────────────── */}
        <Dialog open={!!webhookModelTarget} onOpenChange={(v) => !v && setWebhookModelTarget(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Inbound webhooks — {webhookModelTarget?.name}</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <p className="text-xs text-muted-foreground">
                External systems can POST JSON to a webhook URL to create records in this model.
                The token is the credential — keep it secret.
              </p>

              {/* Existing webhooks */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {webhooksForModel.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No webhooks yet</p>
                )}
                {webhooksForModel.map((wh) => {
                  const url = `${window.location.origin}/api/v1/webhooks/inbound/${wh.token}`;
                  const isEditingThis = editingWebhookId === wh.id;
                  return (
                    <div key={wh.id} className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${wh.is_active ? "bg-green-500" : "bg-muted-foreground"}`} />
                          <span className="text-sm font-medium truncate">{wh.label || "Untitled webhook"}</span>
                          {wh.trigger_count > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {wh.trigger_count} trigger{wh.trigger_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => isEditingThis ? setEditingWebhookId(null) : startEditingFieldMap(wh)}
                          >
                            {isEditingThis ? "Cancel" : "Field map"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => toggleWebhook.mutate(wh.id)}
                          >
                            {wh.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteWebhook.mutate(wh.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 font-mono truncate text-muted-foreground">
                          POST {url}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => copyWebhookUrl(wh.token)}
                          title="Copy webhook URL"
                        >
                          {copiedToken === wh.token ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      {/* Field map editor */}
                      {isEditingThis && (
                        <div className="border-t border-border pt-2 space-y-2">
                          <p className="text-xs text-muted-foreground font-medium">
                            Field mapping — rename incoming JSON keys to record fields
                          </p>
                          <div className="space-y-1.5">
                            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 text-xs text-muted-foreground px-1">
                              <span>Incoming key</span><span />
                              <span>Record field</span><span />
                            </div>
                            {editingFieldMap.map((row, i) => (
                              <div key={row.key || i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 items-center">
                                <Input
                                  value={row.key}
                                  onChange={(e) => setEditingFieldMap((prev) => prev.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
                                  placeholder="incoming_key"
                                  className="h-7 text-xs font-mono"
                                />
                                <span className="text-xs text-muted-foreground px-1">→</span>
                                <Input
                                  value={row.value}
                                  onChange={(e) => setEditingFieldMap((prev) => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                                  placeholder="record_field"
                                  className="h-7 text-xs font-mono"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setEditingFieldMap((prev) => prev.filter((_, j) => j !== i))}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setEditingFieldMap((prev) => [...prev, { key: "", value: "" }])}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add row
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => saveFieldMap(wh.id)}
                              disabled={updateWebhook.isPending}
                            >
                              {updateWebhook.isPending ? "Saving…" : "Save mapping"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Create new webhook */}
              <div className="border-t border-border pt-3 space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Create new webhook
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Label (optional)"
                    value={newWebhookLabel}
                    onChange={(e) => setNewWebhookLabel(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createWebhook.mutate();
                    }}
                  />
                  <Button
                    onClick={() => createWebhook.mutate()}
                    disabled={createWebhook.isPending}
                    size="sm"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {createWebhook.isPending ? "Creating…" : "Create"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A unique secret token is generated automatically.
                  Optionally configure <strong>field_map</strong> to rename incoming JSON keys before record creation.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWebhookModelTarget(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Workflow States Dialog ──────────────────────────────────────── */}
        <Dialog open={!!workflowStatesTarget} onOpenChange={(v) => !v && setWorkflowStatesTarget(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle>Workflow States — {workflowStatesTarget?.name}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define custom states and allowed transitions. The current state is stored in <code className="font-mono">_workflow_state</code>.
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {workflowStates.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No workflow states defined. Add one to get started.</p>
              )}
              {workflowStates.map((state, si) => (
                <div key={si} className="border rounded-lg p-4 space-y-3 bg-card">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={state.color ?? "#64748b"}
                      onChange={(e) => {
                        const next = [...workflowStates];
                        next[si] = { ...next[si], color: e.target.value };
                        setWorkflowStates(next);
                      }}
                      className="h-8 w-8 rounded border cursor-pointer"
                    />
                    <Input
                      value={state.name}
                      onChange={(e) => {
                        const next = [...workflowStates];
                        next[si] = { ...next[si], name: e.target.value };
                        setWorkflowStates(next);
                      }}
                      placeholder="State key (e.g. in_review)"
                      className="h-8 text-sm font-mono flex-1"
                    />
                    <Input
                      value={state.label}
                      onChange={(e) => {
                        const next = [...workflowStates];
                        next[si] = { ...next[si], label: e.target.value };
                        setWorkflowStates(next);
                      }}
                      placeholder="Display label (e.g. In Review)"
                      className="h-8 text-sm flex-1"
                    />
                    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={state.is_initial ?? false}
                        onChange={(e) => {
                          const next = workflowStates.map((s, i) => ({
                            ...s,
                            is_initial: i === si ? e.target.checked : false,
                          }));
                          setWorkflowStates(next);
                        }}
                        className="h-3.5 w-3.5"
                      />
                      Initial
                    </label>
                    <button
                      type="button"
                      onClick={() => setWorkflowStates(workflowStates.filter((_, i) => i !== si))}
                      className="text-destructive hover:text-destructive/70 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Transitions */}
                  <div className="space-y-1.5 pl-2 border-l-2 border-border">
                    <p className="text-xs font-medium text-muted-foreground">Transitions from this state:</p>
                    {(state.transitions ?? []).map((tr, ti) => (
                      <div key={ti} className="flex items-center gap-2">
                        <select
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs h-7"
                          value={tr.to}
                          onChange={(e) => {
                            const next = [...workflowStates];
                            const trs = [...(next[si].transitions ?? [])];
                            trs[ti] = { ...trs[ti], to: e.target.value };
                            next[si] = { ...next[si], transitions: trs };
                            setWorkflowStates(next);
                          }}
                        >
                          <option value="">— select target state —</option>
                          {workflowStates.filter((_, i) => i !== si).map((s) => (
                            <option key={s.name} value={s.name}>{s.label || s.name}</option>
                          ))}
                        </select>
                        <Input
                          value={tr.label}
                          onChange={(e) => {
                            const next = [...workflowStates];
                            const trs = [...(next[si].transitions ?? [])];
                            trs[ti] = { ...trs[ti], label: e.target.value };
                            next[si] = { ...next[si], transitions: trs };
                            setWorkflowStates(next);
                          }}
                          placeholder="Button label"
                          className="flex-1 h-7 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...workflowStates];
                            next[si] = { ...next[si], transitions: (next[si].transitions ?? []).filter((_, i) => i !== ti) };
                            setWorkflowStates(next);
                          }}
                          className="text-destructive hover:text-destructive/70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        const next = [...workflowStates];
                        next[si] = { ...next[si], transitions: [...(next[si].transitions ?? []), { to: "", label: "" }] };
                        setWorkflowStates(next);
                      }}
                    >
                      + Add transition
                    </button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setWorkflowStates([
                    ...workflowStates,
                    { name: "", label: "", color: "#6366f1", is_initial: workflowStates.length === 0, transitions: [] },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add State
              </Button>
            </div>
            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setWorkflowStatesTarget(null)}>Cancel</Button>
              <Button onClick={() => saveWorkflowStates.mutate()} disabled={saveWorkflowStates.isPending}>
                {saveWorkflowStates.isPending ? "Saving…" : "Save States"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DndProvider>
  );
}
