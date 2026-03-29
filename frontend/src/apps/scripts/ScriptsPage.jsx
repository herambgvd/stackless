import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Terminal,
  Trash2,
  Pencil,
  Play,
  Code2,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { scriptsApi } from "@/apps/scripts/api/scripts.api";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { ScriptEditor } from "@/apps/scripts/components/ScriptEditor";

const SERVER_TRIGGER_EVENTS = [
  { value: "before_save", label: "Before Save" },
  { value: "after_save", label: "After Save" },
  { value: "before_delete", label: "Before Delete" },
  { value: "after_delete", label: "After Delete" },
  { value: "api", label: "API Endpoint" },
  { value: "scheduler", label: "Scheduler" },
];

const CLIENT_TRIGGER_EVENTS = [
  { value: "form_load", label: "Form Load" },
  { value: "form_change", label: "Form Change" },
  { value: "form_submit", label: "Form Submit" },
  { value: "list_load", label: "List Load" },
];

const SERVER_PLACEHOLDER = `# Available context:
# doc  — the record being saved (dict)
# frappe.throw(msg)  — abort with error message
# frappe.msgprint(msg)  — show a message

# Example: validate a required field
if not doc.get("name"):
    frappe.throw("Name is required")
`;

const CLIENT_PLACEHOLDER = `// Available context:
// frm  — the current form object
// frm.doc  — the document fields
// frm.set_value(field, value)  — update a field
// frm.refresh_field(field)     — re-render a field

// Example: auto-fill a computed field on change
frappe.ui.form.on("ModelName", {
  refresh(frm) {
    // runs when the form loads
  },
  field_name(frm) {
    // runs when field_name changes
  },
});
`;

function ScriptTypeBadge({ type }) {
  const colors = {
    before_save: "bg-amber-50 text-amber-700 border-amber-200",
    after_save: "bg-green-50 text-green-700 border-green-200",
    before_delete: "bg-red-50 text-red-700 border-red-200",
    after_delete: "bg-red-50 text-red-700 border-red-200",
    api: "bg-purple-50 text-purple-700 border-purple-200",
    scheduler: "bg-blue-50 text-blue-700 border-blue-200",
    form_load: "bg-sky-50 text-sky-700 border-sky-200",
    form_change: "bg-indigo-50 text-indigo-700 border-indigo-200",
    form_submit: "bg-violet-50 text-violet-700 border-violet-200",
    list_load: "bg-teal-50 text-teal-700 border-teal-200",
  };
  return (
    <span
      className={`inline-flex items-center text-xs font-mono font-medium px-2 py-0.5 rounded border ${colors[type] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}
    >
      {type}
    </span>
  );
}

function ScriptCard({ script, kind, appName, onEdit, onDelete, onToggle }) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    await onToggle(script);
    setToggling(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {kind === "server" ? (
          <Terminal className="h-5 w-5" />
        ) : (
          <Code2 className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-900 truncate">
            {script.name}
          </span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              kind === "server"
                ? "bg-blue-50 text-blue-700"
                : "bg-violet-50 text-violet-700"
            }`}
          >
            {kind === "server" ? "Server" : "Client"}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
          {appName && (
            <>
              <span className="font-medium text-slate-600">{appName}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          {script.model_slug && (
            <>
              <span>{script.model_slug}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          <ScriptTypeBadge type={script.script_type} />
        </div>

        {script.description && (
          <p className="mt-1.5 text-xs text-slate-500 line-clamp-1">
            {script.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={script.enabled ? "Disable script" : "Enable script"}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          {script.enabled ? (
            <ToggleRight className="h-5 w-5 text-blue-600" />
          ) : (
            <ToggleLeft className="h-5 w-5" />
          )}
        </button>
        <button
          onClick={() => onEdit(script)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(script)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ScriptList({ scripts, kind, apps, appMap, onEdit, onDelete, onToggle, onNew, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  const allScripts = apps.flatMap((app) =>
    (scripts[app.id] ?? []).map((s) => ({ ...s, _appId: app.id }))
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => onNew(kind)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 font-medium text-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New {kind === "server" ? "Server" : "Client"} Script
        </Button>
      </div>

      {allScripts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-center mx-auto mb-4 h-14 w-14 rounded-full bg-slate-100">
            {kind === "server" ? (
              <Terminal className="h-7 w-7 text-slate-400" />
            ) : (
              <Code2 className="h-7 w-7 text-slate-400" />
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700">
            No {kind === "server" ? "server" : "client"} scripts yet
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
            {kind === "server"
              ? "Add Python scripts that run on the server during record events."
              : "Add JavaScript that runs in the browser on specific form views."}
          </p>
          <Button
            onClick={() => onNew(kind)}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 font-medium text-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New {kind === "server" ? "Server" : "Client"} Script
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {allScripts.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              kind={kind}
              appName={appMap[script._appId]}
              onEdit={(s) => onEdit(s, kind, script._appId)}
              onDelete={(s) => onDelete(s, kind, script._appId)}
              onToggle={(s) => onToggle(s, kind, script._appId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptModal({ apps, editScript, editAppId, kind, onClose, onSaved }) {
  const isEdit = !!editScript;
  const [form, setForm] = useState({
    name: editScript?.name ?? "",
    script_type:
      editScript?.script_type ?? (kind === "server" ? "before_save" : "form_load"),
    model_slug: editScript?.model_slug ?? "",
    description: editScript?.description ?? "",
    script:
      editScript?.script ??
      (kind === "server" ? SERVER_PLACEHOLDER : CLIENT_PLACEHOLDER),
    enabled: editScript?.enabled ?? true,
    app_id: editAppId ?? (apps[0]?.id ?? ""),
  });
  const [testOutput, setTestOutput] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedApp = form.app_id;
  const { data: models = [] } = useQuery({
    queryKey: ["models", selectedApp],
    queryFn: () => schemaApi.listModels(selectedApp),
    enabled: !!selectedApp,
  });

  const triggerEvents = kind === "server" ? SERVER_TRIGGER_EVENTS : CLIENT_TRIGGER_EVENTS;

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Script name is required");
      return;
    }
    if (!form.app_id) {
      toast.error("Please select an app");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        script_type: form.script_type,
        model_slug: form.model_slug || null,
        description: form.description || null,
        script: form.script,
        enabled: form.enabled,
      };
      if (isEdit) {
        if (kind === "server") {
          await scriptsApi.updateServerScript(form.app_id, editScript.id, payload);
        } else {
          await scriptsApi.updateClientScript(form.app_id, editScript.id, payload);
        }
      } else {
        if (kind === "server") {
          await scriptsApi.createServerScript(form.app_id, payload);
        } else {
          await scriptsApi.createClientScript(form.app_id, payload);
        }
      }
      toast.success(isEdit ? "Script updated" : "Script created");
      onSaved(form.app_id);
    } catch (e) {
      toast.error(e.message ?? "Failed to save script");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestOutput(null);
    try {
      const result = await scriptsApi.testServerScript(form.app_id, editScript.id, {});
      setTestOutput(result);
    } catch (e) {
      toast.error(e.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
          <DialogTitle className="text-base font-semibold text-slate-900">
            {isEdit ? "Edit" : "New"}{" "}
            {kind === "server" ? "Server" : "Client"} Script
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name + App row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Script Name *
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Validate Invoice Total"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Target App *
              </Label>
              <Select
                value={form.app_id}
                onValueChange={(v) => {
                  set("app_id", v);
                  set("model_slug", "");
                }}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select app…" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Model + Trigger Event row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Target Model
              </Label>
              <Select
                value={form.model_slug || "__none__"}
                onValueChange={(v) => set("model_slug", v === "__none__" ? "" : v)}
                disabled={!form.app_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any model</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.slug}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Trigger Event *
              </Label>
              <Select
                value={form.script_type}
                onValueChange={(v) => set("script_type", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggerEvents.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Description
            </Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What does this script do?"
              className="resize-none text-sm"
              rows={2}
            />
          </div>

          {/* Code Editor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Code
            </Label>
            <ScriptEditor
              value={form.script}
              onChange={(v) => set("script", v)}
              language={kind === "server" ? "python" : "javascript"}
              placeholder={
                kind === "server" ? SERVER_PLACEHOLDER : CLIENT_PLACEHOLDER
              }
            />
          </div>

          {/* Test output */}
          {testOutput && (
            <div
              className={`rounded-lg border p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed ${
                testOutput.success
                  ? "bg-green-950 border-green-800 text-green-300"
                  : "bg-red-950 border-red-800 text-red-300"
              }`}
            >
              {testOutput.success ? "✓ Success" : `✗ Error: ${testOutput.error}`}
              {testOutput.output?.length > 0 &&
                `\n\nOutput:\n${testOutput.output.join("\n")}`}
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center gap-3 pt-1">
            <Switch
              id="script-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => set("enabled", v)}
            />
            <Label htmlFor="script-enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
              Script active
            </Label>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 shrink-0 flex items-center justify-between">
          <div>
            {kind === "server" && isEdit && (
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing}
                className="text-sm"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {testing ? "Running…" : "Test Run"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="text-sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              {saving ? "Saving…" : isEdit ? "Update Script" : "Create Script"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScriptsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("server");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState("server");
  const [editScript, setEditScript] = useState(null);
  const [editAppId, setEditAppId] = useState(null);

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
  });

  // Fetch server scripts for all apps
  const serverScriptsQueries = useQuery({
    queryKey: ["all-server-scripts", apps.map((a) => a.id)],
    queryFn: async () => {
      if (!apps.length) return {};
      const results = await Promise.all(
        apps.map(async (app) => {
          try {
            const data = await scriptsApi.listServerScripts(app.id);
            return [app.id, data];
          } catch {
            return [app.id, []];
          }
        })
      );
      return Object.fromEntries(results);
    },
    enabled: apps.length > 0,
  });

  // Fetch client scripts for all apps
  const clientScriptsQueries = useQuery({
    queryKey: ["all-client-scripts", apps.map((a) => a.id)],
    queryFn: async () => {
      if (!apps.length) return {};
      const results = await Promise.all(
        apps.map(async (app) => {
          try {
            const data = await scriptsApi.listClientScripts(app.id);
            return [app.id, data];
          } catch {
            return [app.id, []];
          }
        })
      );
      return Object.fromEntries(results);
    },
    enabled: apps.length > 0,
  });

  const appMap = Object.fromEntries(apps.map((a) => [a.id, a.name]));

  function openNew(kind) {
    setModalKind(kind);
    setEditScript(null);
    setEditAppId(null);
    setModalOpen(true);
  }

  function openEdit(script, kind, appId) {
    setModalKind(kind);
    setEditScript(script);
    setEditAppId(appId);
    setModalOpen(true);
  }

  function handleSaved(appId) {
    qc.invalidateQueries({ queryKey: ["all-server-scripts"] });
    qc.invalidateQueries({ queryKey: ["all-client-scripts"] });
    qc.invalidateQueries({ queryKey: ["server-scripts", appId] });
    qc.invalidateQueries({ queryKey: ["client-scripts", appId] });
    setModalOpen(false);
  }

  async function handleDelete(script, kind, appId) {
    if (!window.confirm(`Delete "${script.name}"? This cannot be undone.`)) return;
    try {
      if (kind === "server") {
        await scriptsApi.deleteServerScript(appId, script.id);
      } else {
        await scriptsApi.deleteClientScript(appId, script.id);
      }
      toast.success("Script deleted");
      qc.invalidateQueries({ queryKey: ["all-server-scripts"] });
      qc.invalidateQueries({ queryKey: ["all-client-scripts"] });
      qc.invalidateQueries({ queryKey: [`${kind}-scripts`, appId] });
    } catch (e) {
      toast.error(e.message ?? "Delete failed");
    }
  }

  async function handleToggle(script, kind, appId) {
    try {
      const payload = { enabled: !script.enabled };
      if (kind === "server") {
        await scriptsApi.updateServerScript(appId, script.id, payload);
      } else {
        await scriptsApi.updateClientScript(appId, script.id, payload);
      }
      qc.invalidateQueries({ queryKey: ["all-server-scripts"] });
      qc.invalidateQueries({ queryKey: ["all-client-scripts"] });
      toast.success(script.enabled ? "Script disabled" : "Script enabled");
    } catch (e) {
      toast.error(e.message ?? "Update failed");
    }
  }

  const isLoading =
    appsLoading ||
    (apps.length > 0 &&
      (serverScriptsQueries.isLoading || clientScriptsQueries.isLoading));

  const serverScripts = serverScriptsQueries.data ?? {};
  const clientScripts = clientScriptsQueries.data ?? {};

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Terminal className="h-6 w-6 text-blue-600" />
              Scripts
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Add custom Python and JavaScript logic to automate form behavior
            </p>
          </div>
          <Button
            onClick={() => openNew(tab)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 font-medium text-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Script
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border border-slate-200 rounded-lg p-1">
            <TabsTrigger
              value="server"
              className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md"
            >
              <Terminal className="h-3.5 w-3.5 mr-1.5" />
              Server Scripts
            </TabsTrigger>
            <TabsTrigger
              value="client"
              className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md"
            >
              <Code2 className="h-3.5 w-3.5 mr-1.5" />
              Client Scripts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="server" className="mt-5">
            <ScriptList
              scripts={serverScripts}
              kind="server"
              apps={apps}
              appMap={appMap}
              onNew={openNew}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="client" className="mt-5">
            <ScriptList
              scripts={clientScripts}
              kind="client"
              apps={apps}
              appMap={appMap}
              onNew={openNew}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>
      </div>

      {modalOpen && (
        <ScriptModal
          apps={apps}
          editScript={editScript}
          editAppId={editAppId}
          kind={modalKind}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
