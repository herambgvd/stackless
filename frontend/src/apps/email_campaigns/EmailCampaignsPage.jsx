import { useState } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Mail, Plus, Send, Pencil, Trash2, MoreVertical, Loader2,
  Users, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";

const campaignApi = {
  list: async () => {
    const res = await apiClient.get("/email/campaigns");
    return res.data;
  },
  create: async (data) => {
    const res = await apiClient.post("/email/campaigns", data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await apiClient.put(`/email/campaigns/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    await apiClient.delete(`/email/campaigns/${id}`);
  },
  send: async (id) => {
    const res = await apiClient.post(`/email/campaigns/${id}/send`);
    return res.data;
  },
  logs: async (id) => {
    const res = await apiClient.get(`/email/campaigns/${id}/logs`);
    return res.data;
  },
};

const STATUS_BADGE = {
  draft:      { label: "Draft",     variant: "secondary" },
  scheduled:  { label: "Scheduled", variant: "outline" },
  sending:    { label: "Sending",   variant: "default" },
  sent:       { label: "Sent",      variant: "success" },
  cancelled:  { label: "Cancelled", variant: "destructive" },
};

const EMPTY = {
  name: "", subject: "", body_html: "", from_name: "", from_email: "",
  contacts_raw: "", // textarea — one email per line or CSV
};

function CampaignDialog({ open, onClose, edit }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(edit ? {
    name: edit.name,
    subject: edit.subject,
    body_html: edit.body_html,
    from_name: edit.from_name || "",
    from_email: edit.from_email || "",
    contacts_raw: edit.contacts.map(c => c.email).join("\n"),
  } : EMPTY);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const mutation = useMutation({
    mutationFn: () => {
      const contacts = form.contacts_raw
        .split(/[\n,]+/)
        .map(e => e.trim())
        .filter(Boolean)
        .map(e => ({ email: e }));
      const payload = {
        name: form.name,
        subject: form.subject,
        body_html: form.body_html,
        from_name: form.from_name || null,
        from_email: form.from_email || null,
        contacts,
      };
      return edit ? campaignApi.update(edit.id, payload) : campaignApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success(edit ? "Campaign updated" : "Campaign created");
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>{edit ? "Edit Campaign" : "New Campaign"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Campaign name</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1 h-8 text-sm" placeholder="Q1 Newsletter" />
            </div>
            <div>
              <Label className="text-xs">Subject line</Label>
              <Input value={form.subject} onChange={e => set("subject", e.target.value)} className="mt-1 h-8 text-sm" placeholder="Your April update is here" />
            </div>
            <div>
              <Label className="text-xs">From name</Label>
              <Input value={form.from_name} onChange={e => set("from_name", e.target.value)} className="mt-1 h-8 text-sm" placeholder="Stackless Team" />
            </div>
            <div>
              <Label className="text-xs">From email</Label>
              <Input value={form.from_email} onChange={e => set("from_email", e.target.value)} className="mt-1 h-8 text-sm" placeholder="hello@yourapp.com" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Recipients <span className="text-muted-foreground">(one email per line or comma-separated)</span></Label>
            <Textarea
              value={form.contacts_raw}
              onChange={e => set("contacts_raw", e.target.value)}
              className="mt-1 text-xs font-mono min-h-[80px]"
              placeholder={"alice@example.com\nbob@example.com"}
            />
          </div>

          <div>
            <Label className="text-xs">Email body (HTML — supports <code className="font-mono text-[11px]">{"{{ name }}"}</code> variable)</Label>
            <Textarea
              value={form.body_html}
              onChange={e => set("body_html", e.target.value)}
              className="mt-1 text-xs font-mono min-h-[200px]"
              placeholder={"<p>Hi {{ name }},</p>\n<p>Here's what's new…</p>"}
            />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.subject || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {edit ? "Save" : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignLogsDialog({ open, onClose, campaign }) {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-logs", campaign?.id],
    queryFn: () => campaignApi.logs(campaign.id),
    enabled: !!campaign?.id && open,
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Send Log — {campaign?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 rounded" />)}</div>
          ) : !data?.items?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No send records yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">Email</th>
                  <th className="text-left py-1.5 pr-3">Status</th>
                  <th className="text-left py-1.5">Error</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-1.5 pr-3 font-mono">{row.email}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={row.status === "sent" ? "success" : "destructive"} className="text-[10px] px-1.5 py-0">
                        {row.status}
                      </Badge>
                    </td>
                    <td className="py-1.5 text-destructive truncate max-w-[180px]">{row.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailCampaignsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [logsFor, setLogsFor] = useState(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: campaignApi.list,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => campaignApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campaign deleted");
    },
  });

  const sendMut = useMutation({
    mutationFn: (id) => campaignApi.send(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campaign send started");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to send"),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Email Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Send bulk emails and newsletters to your contacts</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Campaign
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-20 text-center">
          <Mail className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No campaigns yet</p>
          <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create your first campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const st = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
            return (
              <div key={c.id} className="border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-primary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <Badge variant={st.variant} className="text-[10px] px-1.5 py-0">{st.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.total_recipients || c.contacts?.length || 0} recipients</span>
                    {c.sent_count > 0 && <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" />{c.sent_count} sent</span>}
                    {c.failed_count > 0 && <span className="flex items-center gap-1 text-destructive"><XCircle className="h-3 w-3" />{c.failed_count} failed</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(c.status === "draft" || c.status === "scheduled") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (await confirm({ title: "Send Campaign", message: `Send "${c.name}" to ${c.contacts?.length || 0} recipients now?`, confirmLabel: "Send" })) {
                          sendMut.mutate(c.id);
                        }
                      }}
                      disabled={sendMut.isPending}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Send
                    </Button>
                  )}
                  {c.status === "sent" && (
                    <Button size="sm" variant="ghost" onClick={() => setLogsFor(c)}>
                      <Clock className="h-3.5 w-3.5 mr-1" /> Logs
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {c.status === "draft" && (
                        <DropdownMenuItem onClick={() => setEditCampaign(c)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setLogsFor(c)}>
                        <Clock className="h-3.5 w-3.5 mr-2" /> View Logs
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={async () => { if (await confirm({ title: "Delete Campaign", message: `Delete "${c.name}"?`, confirmLabel: "Delete", variant: "destructive" })) deleteMut.mutate(c.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showCreate || editCampaign) && (
        <CampaignDialog
          open
          onClose={() => { setShowCreate(false); setEditCampaign(null); }}
          edit={editCampaign}
        />
      )}
      {logsFor && (
        <CampaignLogsDialog open onClose={() => setLogsFor(null)} campaign={logsFor} />
      )}
    </div>
  );
}
