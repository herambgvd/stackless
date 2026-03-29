import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { scriptsApi } from "../api/scripts.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Plus, Edit2, Trash2, Code2, Play } from "lucide-react";
import { toast } from "sonner";

const SERVER_TYPES = ["before_save", "after_save", "before_delete", "after_delete", "api", "scheduler"];
const CLIENT_TYPES = ["form_load", "form_change", "form_submit", "list_load"];

export default function ScriptsPage() {
  const { appId } = useParams({ from: "/_authenticated/apps/$appId/scripts" });
  const qc = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editScript, setEditScript] = useState(null);
  const [scriptKind, setScriptKind] = useState("server");

  const serverScripts = useQuery({
    queryKey: ["server-scripts", appId],
    queryFn: () => scriptsApi.listServerScripts(appId),
  });
  const clientScripts = useQuery({
    queryKey: ["client-scripts", appId],
    queryFn: () => scriptsApi.listClientScripts(appId),
  });

  function openNew(kind) {
    setScriptKind(kind);
    setEditScript(null);
    setEditorOpen(true);
  }

  function openEdit(script, kind) {
    setScriptKind(kind);
    setEditScript(script);
    setEditorOpen(true);
  }

  async function handleDelete(id, kind) {
    try {
      if (kind === "server") await scriptsApi.deleteServerScript(appId, id);
      else await scriptsApi.deleteClientScript(appId, id);
      qc.invalidateQueries({ queryKey: [kind === "server" ? "server-scripts" : "client-scripts", appId] });
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  }

  function ScriptList({ scripts = [], kind }) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openNew(kind)}>
            <Plus className="h-4 w-4 mr-1" /> New {kind === "server" ? "Server" : "Client"} Script
          </Button>
        </div>
        {scripts.length === 0 ? (
          <div className="text-center py-12 border rounded-xl text-muted-foreground">
            <Code2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            No {kind} scripts yet
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Model</th>
                  <th className="text-left px-4 py-3">Enabled</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {scripts.map(s => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.script_type}</code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.model_slug || "—"}</td>
                    <td className="px-4 py-3"><Switch checked={s.enabled} disabled /></td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s, kind)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => handleDelete(s.id, kind)}
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
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Code2 className="h-6 w-6" /> Scripts
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Add custom Python and JavaScript logic to your app</p>
      </div>

      <Tabs defaultValue="server">
        <TabsList>
          <TabsTrigger value="server">Server Scripts</TabsTrigger>
          <TabsTrigger value="client">Client Scripts</TabsTrigger>
        </TabsList>
        <TabsContent value="server" className="mt-4">
          <ScriptList scripts={serverScripts.data || []} kind="server" />
        </TabsContent>
        <TabsContent value="client" className="mt-4">
          <ScriptList scripts={clientScripts.data || []} kind="client" />
        </TabsContent>
      </Tabs>

      {editorOpen && (
        <ScriptEditorModal
          appId={appId}
          kind={scriptKind}
          script={editScript}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({
              queryKey: [scriptKind === "server" ? "server-scripts" : "client-scripts", appId],
            });
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ScriptEditorModal({ appId, kind, script, onClose, onSaved }) {
  const isEdit = !!script;
  const [form, setForm] = useState({
    name: script?.name || "",
    script_type: script?.script_type || (kind === "server" ? "before_save" : "form_load"),
    model_slug: script?.model_slug || "",
    description: script?.description || "",
    script: script?.script || (kind === "server"
      ? "# doc is available as a dict\n# Raise an exception to abort\n\npass\n"
      : "// frappe.ui.form.on('ModelName', {\n//   refresh(frm) { }\n// })\n"),
    enabled: script?.enabled ?? true,
  });
  const [testOutput, setTestOutput] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      if (isEdit) {
        if (kind === "server") await scriptsApi.updateServerScript(appId, script.id, form);
        else await scriptsApi.updateClientScript(appId, script.id, form);
      } else {
        if (kind === "server") await scriptsApi.createServerScript(appId, form);
        else await scriptsApi.createClientScript(appId, form);
      }
      toast.success("Saved");
      onSaved();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestOutput(null);
    try {
      const result = await scriptsApi.testServerScript(appId, script.id, {});
      setTestOutput(result);
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  }

  const types = kind === "server" ? SERVER_TYPES : CLIENT_TYPES;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : "New"} {kind === "server" ? "Server" : "Client"} Script
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Script"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.script_type} onValueChange={v => setForm(f => ({ ...f, script_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Model Slug (optional)</Label>
            <Input
              value={form.model_slug}
              onChange={e => setForm(f => ({ ...f, model_slug: e.target.value }))}
              placeholder="orders"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this script do?"
              className="mt-1 resize-none"
              rows={2}
            />
          </div>
          <div>
            <Label>Script</Label>
            <textarea
              value={form.script}
              onChange={e => setForm(f => ({ ...f, script: e.target.value }))}
              className="mt-1 w-full font-mono text-sm border rounded-md p-3 bg-muted/30 resize-y"
              rows={20}
              spellCheck={false}
            />
          </div>
          {testOutput && (
            <div className="rounded border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap">
              {testOutput.success ? "✓ Success" : "✗ Error: " + testOutput.error}
              {testOutput.output?.length > 0 && "\n\nOutput:\n" + testOutput.output.join("\n")}
            </div>
          )}
          <div className="flex items-center gap-2 justify-between pt-2">
            <div className="flex gap-2">
              {kind === "server" && isEdit && (
                <Button variant="outline" onClick={handleTest} disabled={testing}>
                  <Play className="h-4 w-4 mr-1" /> Test Run
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
