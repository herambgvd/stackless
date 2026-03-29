import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Star,
  Building2,
  Image,
  Globe,
  Phone,
  Mail,
  MapPin,
  Code2,
  Eye,
  CheckCircle2,
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
import { printFormatsApi } from "@/apps/print-formats/api/printFormats.api";
import { schemaApi } from "@/apps/app-builder/api/schema.api";

// ── Default template ──────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE = `<h2 style="margin:0 0 16px;font-size:20px;color:#111;">{{ _model_name }}</h2>

<table>
  <thead>
    <tr>
      <th>Field</th>
      <th>Value</th>
    </tr>
  </thead>
  <tbody>
    {% for key, value in _record.items() %}
    {% if not key.startswith('_') %}
    <tr>
      <td style="font-weight:500;">{{ key }}</td>
      <td>{{ value }}</td>
    </tr>
    {% endif %}
    {% endfor %}
  </tbody>
</table>

<p style="margin-top:20px;font-size:12px;color:#888;">Printed on {{ _printed_at }}</p>
`;

// ── Print Format Card ─────────────────────────────────────────────────────────

function PrintFormatCard({ pf, appName, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <FileText className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-900 truncate">{pf.name}</span>
          {pf.is_default && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <Star className="h-2.5 w-2.5" />
              Default
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="font-medium text-slate-600">{appName}</span>
          <span className="text-slate-300">›</span>
          <span className="font-mono">{pf.model_slug}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(pf)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(pf)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Print Format Modal ────────────────────────────────────────────────────────

function PrintFormatModal({ apps, letterHeads, editPf, onClose, onSaved }) {
  const isEdit = !!editPf;

  const [form, setForm] = useState({
    app_id: editPf?.app_id ?? (apps[0]?.id ?? ""),
    model_slug: editPf?.model_slug ?? "",
    name: editPf?.name ?? "",
    html_template: editPf?.html_template ?? DEFAULT_TEMPLATE,
    is_default: editPf?.is_default ?? false,
    letter_head_id: editPf?.letter_head_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [previewTab, setPreviewTab] = useState("editor");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const { data: models = [] } = useQuery({
    queryKey: ["models", form.app_id],
    queryFn: () => schemaApi.listModels(form.app_id),
    enabled: !!form.app_id,
  });

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.app_id) { toast.error("Select an app"); return; }
    if (!form.model_slug) { toast.error("Select a model"); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        html_template: form.html_template,
        is_default: form.is_default,
        letter_head_id: form.letter_head_id || null,
      };

      if (isEdit) {
        await printFormatsApi.update(editPf.app_id, editPf.model_slug, editPf.id, payload);
      } else {
        await printFormatsApi.create(form.app_id, form.model_slug, payload);
      }

      toast.success(isEdit ? "Print format updated" : "Print format created");
      onSaved();
    } catch (e) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
          <DialogTitle className="text-base font-semibold text-slate-900">
            {isEdit ? "Edit" : "New"} Print Format
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name + App + Model */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Invoice Standard" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">App *</Label>
              <Select value={form.app_id} onValueChange={(v) => { set("app_id", v); set("model_slug", ""); }} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Select app…" /></SelectTrigger>
                <SelectContent>
                  {apps.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Model *</Label>
              <Select value={form.model_slug || "__none__"} onValueChange={(v) => set("model_slug", v === "__none__" ? "" : v)} disabled={isEdit || !form.app_id}>
                <SelectTrigger><SelectValue placeholder="Select model…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select model…</SelectItem>
                  {models.map((m) => <SelectItem key={m.id} value={m.slug}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Letter Head */}
          {letterHeads.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Letter Head</Label>
              <Select value={form.letter_head_id || "__none__"} onValueChange={(v) => set("letter_head_id", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No letter head" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {letterHeads.map((lh) => (
                    <SelectItem key={lh.id} value={lh.id}>
                      {lh.name}{lh.is_default ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* HTML Template editor with preview toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">HTML Template</Label>
              <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
                <button
                  onClick={() => setPreviewTab("editor")}
                  className={`px-2.5 py-1 flex items-center gap-1.5 transition-colors ${previewTab === "editor" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <Code2 className="h-3 w-3" /> Editor
                </button>
                <button
                  onClick={() => setPreviewTab("preview")}
                  className={`px-2.5 py-1 flex items-center gap-1.5 transition-colors border-l border-slate-200 ${previewTab === "preview" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
              </div>
            </div>

            {previewTab === "editor" ? (
              <Textarea
                value={form.html_template}
                onChange={(e) => set("html_template", e.target.value)}
                placeholder={DEFAULT_TEMPLATE}
                className="font-mono text-xs resize-none h-56 bg-slate-950 text-slate-100 border-slate-700 focus:border-blue-500"
                spellCheck={false}
              />
            ) : (
              <div
                className="h-56 overflow-auto rounded-md border border-slate-200 bg-white p-4 text-sm"
                dangerouslySetInnerHTML={{ __html: form.html_template }}
              />
            )}
            <p className="text-xs text-slate-400">
              Use Jinja2 syntax. Available vars: <span className="font-mono">{"{{ field_name }}"}</span>, <span className="font-mono">{"{{ _record }}"}</span>, <span className="font-mono">{"{{ _model_name }}"}</span>, <span className="font-mono">{"{{ _printed_at }}"}</span>
            </p>
          </div>

          {/* Default toggle */}
          <div className="flex items-center gap-3">
            <Switch id="pf-default" checked={form.is_default} onCheckedChange={(v) => set("is_default", v)} />
            <Label htmlFor="pf-default" className="text-sm font-medium text-slate-700 cursor-pointer">
              Set as default format for this model
            </Label>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm">
            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Letter Head Card ──────────────────────────────────────────────────────────

function LetterHeadCard({ lh, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {lh.logo_url ? (
          <img src={lh.logo_url} alt="" className="h-8 w-8 object-contain rounded" />
        ) : (
          <Building2 className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 truncate">{lh.name}</span>
          {lh.is_default && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <Star className="h-2.5 w-2.5" /> Default
            </span>
          )}
        </div>
        {lh.company_name && (
          <p className="mt-0.5 text-xs font-medium text-slate-600">{lh.company_name}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
          {lh.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lh.phone}</span>}
          {lh.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lh.email}</span>}
          {lh.website && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{lh.website}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(lh)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Edit">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(lh)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Letter Head Modal ─────────────────────────────────────────────────────────

function LetterHeadModal({ editLh, onClose, onSaved }) {
  const isEdit = !!editLh;
  const [form, setForm] = useState({
    name: editLh?.name ?? "",
    company_name: editLh?.company_name ?? "",
    logo_url: editLh?.logo_url ?? "",
    address: editLh?.address ?? "",
    phone: editLh?.phone ?? "",
    email: editLh?.email ?? "",
    website: editLh?.website ?? "",
    header_html: editLh?.header_html ?? "",
    footer_html: editLh?.footer_html ?? "",
    is_default: editLh?.is_default ?? false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        logo_url: form.logo_url || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        header_html: form.header_html || null,
        footer_html: form.footer_html || null,
      };
      if (isEdit) {
        await printFormatsApi.updateLetterHead(editLh.id, payload);
      } else {
        await printFormatsApi.createLetterHead(payload);
      }
      toast.success(isEdit ? "Letter head updated" : "Letter head created");
      onSaved();
    } catch (e) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
          <DialogTitle className="text-base font-semibold text-slate-900">
            {isEdit ? "Edit" : "New"} Letter Head
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. My Company Header" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Company Name</Label>
              <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Corp" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
              <Image className="h-3.5 w-3.5" /> Logo URL
            </Label>
            <Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…/logo.png or data:image/…" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Phone
              </Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@company.com" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Website
              </Label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://company.com" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Address
            </Label>
            <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St&#10;City, State ZIP&#10;Country" rows={3} className="resize-none text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Custom Header HTML</Label>
              <Textarea value={form.header_html} onChange={(e) => set("header_html", e.target.value)} placeholder="Optional — overrides auto-generated header" rows={3} className="font-mono text-xs resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Custom Footer HTML</Label>
              <Textarea value={form.footer_html} onChange={(e) => set("footer_html", e.target.value)} placeholder="Optional — overrides auto-generated footer" rows={3} className="font-mono text-xs resize-none" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="lh-default" checked={form.is_default} onCheckedChange={(v) => set("is_default", v)} />
            <Label htmlFor="lh-default" className="text-sm font-medium text-slate-700 cursor-pointer">
              Set as default letter head
            </Label>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm">
            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PrintFormatsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("formats");
  const [pfModal, setPfModal] = useState(null); // null | "new" | PrintFormat object
  const [lhModal, setLhModal] = useState(null); // null | "new" | LetterHead object

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
  });

  const { data: letterHeads = [], isLoading: lhLoading } = useQuery({
    queryKey: ["letter-heads"],
    queryFn: () => printFormatsApi.listLetterHeads(),
  });

  // Fetch all print formats across all apps × models
  const { data: allFormats = [], isLoading: pfLoading } = useQuery({
    queryKey: ["all-print-formats", apps.map((a) => a.id)],
    queryFn: async () => {
      if (!apps.length) return [];
      const { data: allModels } = await Promise.all(
        apps.map(async (app) => {
          try {
            const models = await schemaApi.listModels(app.id);
            return models.map((m) => ({ app, model: m }));
          } catch {
            return [];
          }
        })
      ).then((results) => ({ data: results.flat() }));

      const fmtResults = await Promise.all(
        allModels.map(async ({ app, model }) => {
          try {
            const fmts = await printFormatsApi.list(app.id, model.slug);
            return fmts.map((f) => ({ ...f, _appName: app.name }));
          } catch {
            return [];
          }
        })
      );
      return fmtResults.flat();
    },
    enabled: apps.length > 0,
  });

  const appMap = Object.fromEntries(apps.map((a) => [a.id, a.name]));
  const isLoading = appsLoading || (apps.length > 0 && pfLoading) || lhLoading;

  async function handleDeletePf(pf) {
    if (!window.confirm(`Delete "${pf.name}"? This cannot be undone.`)) return;
    try {
      await printFormatsApi.delete(pf.app_id, pf.model_slug, pf.id);
      toast.success("Print format deleted");
      qc.invalidateQueries({ queryKey: ["all-print-formats"] });
    } catch (e) {
      toast.error(e.message ?? "Delete failed");
    }
  }

  async function handleDeleteLh(lh) {
    if (!window.confirm(`Delete letter head "${lh.name}"?`)) return;
    try {
      await printFormatsApi.deleteLetterHead(lh.id);
      toast.success("Letter head deleted");
      qc.invalidateQueries({ queryKey: ["letter-heads"] });
    } catch (e) {
      toast.error(e.message ?? "Delete failed");
    }
  }

  function handlePfSaved() {
    qc.invalidateQueries({ queryKey: ["all-print-formats"] });
    setPfModal(null);
  }

  function handleLhSaved() {
    qc.invalidateQueries({ queryKey: ["letter-heads"] });
    setLhModal(null);
  }

  const Skeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <FileText className="h-6 w-6 text-blue-600" />
              Print Formats
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Design HTML templates to print records. Attach letter heads for branded output.
            </p>
          </div>
          <Button
            onClick={() => tab === "formats" ? setPfModal("new") : setLhModal("new")}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 font-medium text-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {tab === "formats" ? "New Print Format" : "New Letter Head"}
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border border-slate-200 rounded-lg p-1">
            <TabsTrigger
              value="formats"
              className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Print Formats
              {!pfLoading && allFormats.length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold bg-blue-500/20 text-blue-700 rounded-full px-1.5 py-0.5 data-[state=active]:bg-white/20 data-[state=active]:text-white">
                  {allFormats.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="letterheads"
              className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md"
            >
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Letter Heads
              {!lhLoading && letterHeads.length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold bg-blue-500/20 text-blue-700 rounded-full px-1.5 py-0.5 data-[state=active]:bg-white/20 data-[state=active]:text-white">
                  {letterHeads.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Print Formats Tab ── */}
          <TabsContent value="formats" className="mt-5">
            {isLoading ? (
              <Skeleton />
            ) : allFormats.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center justify-center mx-auto mb-4 h-14 w-14 rounded-full bg-slate-100">
                  <FileText className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No print formats yet</p>
                <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                  Create HTML templates to generate printable documents from your records.
                </p>
                <Button
                  onClick={() => setPfModal("new")}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 font-medium text-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> New Print Format
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {allFormats.map((pf) => (
                  <PrintFormatCard
                    key={pf.id}
                    pf={pf}
                    appName={appMap[pf.app_id] ?? pf.app_id}
                    onEdit={(p) => setPfModal(p)}
                    onDelete={handleDeletePf}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Letter Heads Tab ── */}
          <TabsContent value="letterheads" className="mt-5">
            {lhLoading ? (
              <Skeleton />
            ) : letterHeads.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center justify-center mx-auto mb-4 h-14 w-14 rounded-full bg-slate-100">
                  <Building2 className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No letter heads yet</p>
                <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                  Create a company letter head with logo, address, and contact details.
                </p>
                <Button
                  onClick={() => setLhModal("new")}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 font-medium text-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> New Letter Head
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {letterHeads.map((lh) => (
                  <LetterHeadCard
                    key={lh.id}
                    lh={lh}
                    onEdit={(l) => setLhModal(l)}
                    onDelete={handleDeleteLh}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Print Format Modal */}
      {pfModal !== null && (
        <PrintFormatModal
          apps={apps}
          letterHeads={letterHeads}
          editPf={pfModal === "new" ? null : pfModal}
          onClose={() => setPfModal(null)}
          onSaved={handlePfSaved}
        />
      )}

      {/* Letter Head Modal */}
      {lhModal !== null && (
        <LetterHeadModal
          editLh={lhModal === "new" ? null : lhModal}
          onClose={() => setLhModal(null)}
          onSaved={handleLhSaved}
        />
      )}
    </div>
  );
}
