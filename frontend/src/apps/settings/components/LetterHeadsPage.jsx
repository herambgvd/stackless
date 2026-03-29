import { useState } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { letterHeadApi } from "@/apps/app-builder/api/print-formats.api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

const EMPTY = {
  name: "",
  company_name: "",
  logo_url: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  header_html: "",
  footer_html: "",
  is_default: false,
};

export function LetterHeadsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: letterHeads = [], isLoading } = useQuery({
    queryKey: ["letter-heads"],
    queryFn: () => letterHeadApi.list(),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form, logo_url: form.logo_url || null };
      if (editTarget) return letterHeadApi.update(editTarget.id, payload);
      return letterHeadApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["letter-heads"] });
      setDialogOpen(false);
      toast.success(editTarget ? "Letter head updated" : "Letter head created");
    },
    onError: (e) => toast.error(e.message ?? "Failed to save letter head"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => letterHeadApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["letter-heads"] });
      toast.success("Letter head deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  function openNew() {
    setEditTarget(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  }

  function openEdit(lh) {
    setEditTarget(lh);
    setForm({
      name: lh.name,
      company_name: lh.company_name ?? "",
      logo_url: lh.logo_url ?? "",
      address: lh.address ?? "",
      phone: lh.phone ?? "",
      email: lh.email ?? "",
      website: lh.website ?? "",
      header_html: lh.header_html ?? "",
      footer_html: lh.footer_html ?? "",
      is_default: lh.is_default ?? false,
    });
    setDialogOpen(true);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Letter Heads
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Company letter head appears at the top and bottom of printed documents.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> New Letter Head
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : letterHeads.length === 0 ? (
        <div className="text-center py-16 border rounded-xl">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium">No letter heads yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create one to add company branding to print formats</p>
          <Button className="mt-4" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Create Letter Head
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Default</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {letterHeads.map((lh) => (
                <tr key={lh.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{lh.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lh.company_name || "—"}</td>
                  <td className="px-4 py-3">
                    {lh.is_default && (
                      <span className="text-xs text-primary font-medium">Default</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(lh)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (await confirm({ title: "Delete Letter Head", message: `Delete letter head "${lh.name}"?`, confirmLabel: "Delete", variant: "destructive" })) deleteMut.mutate(lh.id);
                      }}
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

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>{editTarget ? "Edit Letter Head" : "New Letter Head"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Corp Header" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company Name</Label>
              <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Corporation" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Logo URL</Label>
              <Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://… or data:image/png;base64,…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="info@company.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Website</Label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://www.company.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="123 Main St&#10;Suite 100&#10;New York, NY 10001"
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Custom Header HTML (overrides auto-generated)
              </Label>
              <Textarea
                value={form.header_html}
                onChange={(e) => set("header_html", e.target.value)}
                placeholder="<div style='...'>...</div>"
                rows={4}
                className="text-xs font-mono resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Custom Footer HTML (overrides auto-generated)
              </Label>
              <Textarea
                value={form.footer_html}
                onChange={(e) => set("footer_html", e.target.value)}
                placeholder="<div style='...'>...</div>"
                rows={3}
                className="text-xs font-mono resize-none"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => set("is_default", e.target.checked)}
                className="h-4 w-4 rounded border border-input"
              />
              <span className="text-sm">Set as default letter head</span>
            </label>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.name.trim() || saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : editTarget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
