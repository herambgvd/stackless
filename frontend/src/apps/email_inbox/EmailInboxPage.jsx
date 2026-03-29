import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Inbox, RefreshCw, Settings2, Paperclip, Circle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { fmtSmart } from "@/shared/lib/date";

const inboxApi = {
  getConfig: () => apiClient.get("/email/inbox/config").then(r => r.data),
  saveConfig: (data) => apiClient.put("/email/inbox/config", data).then(r => r.data),
  poll: () => apiClient.post("/email/inbox/poll").then(r => r.data),
  listEmails: (params) => apiClient.get("/email/inbox/emails", { params }).then(r => r.data),
  getEmail: (id) => apiClient.get(`/email/inbox/emails/${id}`).then(r => r.data),
  linkEmail: (id, data) => apiClient.patch(`/email/inbox/emails/${id}/link`, data).then(r => r.data),
};

const IMAP_DEFAULTS = {
  imap_host: "", imap_port: 993, imap_username: "", imap_password: "",
  use_ssl: true, mailbox: "INBOX", is_active: true,
};

function InboxConfigDialog({ open, onClose }) {
  const qc = useQueryClient();
  const { data: cfg, isLoading: cfgLoading } = useQuery({
    queryKey: ["inbox-config"],
    queryFn: inboxApi.getConfig,
    enabled: open,
    retry: false, // 404 = no config yet, show blank form
  });
  const [form, setForm] = useState(IMAP_DEFAULTS);

  // Populate form once config loads; keep defaults when no config exists
  useEffect(() => {
    if (cfg) {
      setForm({
        imap_host: cfg.imap_host || "",
        imap_port: cfg.imap_port || 993,
        imap_username: cfg.imap_username || "",
        imap_password: "",          // never pre-fill password
        use_ssl: cfg.use_ssl ?? true,
        mailbox: cfg.mailbox || "INBOX",
        is_active: cfg.is_active ?? true,
      });
    }
  }, [cfg]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const saveMut = useMutation({
    mutationFn: () => {
      // Don't overwrite existing password if user left the field blank
      const payload = { ...form };
      if (!payload.imap_password) delete payload.imap_password;
      return inboxApi.saveConfig(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-config"] });
      toast.success("Inbox configuration saved");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> IMAP Inbox Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {cfgLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 rounded" />)}</div>
          ) : null}
          <div className={cfgLoading ? "hidden" : ""}>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">IMAP Host</Label>
              <Input value={form.imap_host} onChange={e => set("imap_host", e.target.value)} className="mt-1 h-8 text-sm" placeholder="imap.gmail.com" />
            </div>
            <div>
              <Label className="text-xs">Port</Label>
              <Input type="number" value={form.imap_port} onChange={e => set("imap_port", Number(e.target.value))} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Username / Email</Label>
            <Input value={form.imap_username} onChange={e => set("imap_username", e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Password / App password</Label>
            <Input type="password" value={form.imap_password} onChange={e => set("imap_password", e.target.value)} className="mt-1 h-8 text-sm" placeholder="Leave blank to keep existing" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Mailbox folder</Label>
              <Input value={form.mailbox} onChange={e => set("mailbox", e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Switch checked={form.use_ssl} onCheckedChange={v => set("use_ssl", v)} />
              Use SSL/TLS
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Switch checked={form.is_active} onCheckedChange={v => set("is_active", v)} />
              Active
            </label>
          </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDetailDialog({ emailId, tenantId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ["inbound-email", emailId],
    queryFn: () => inboxApi.getEmail(emailId),
    enabled: !!emailId,
  });

  return (
    <Dialog open={!!emailId} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="truncate">{data?.subject || "Loading…"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-6 rounded" />)}</div>
          ) : data ? (
            <div className="space-y-4">
              <div className="text-sm space-y-1 text-muted-foreground">
                <p><span className="font-medium text-foreground">From:</span> {data.from_name} &lt;{data.from_email}&gt;</p>
                <p><span className="font-medium text-foreground">To:</span> {data.to_emails.join(", ")}</p>
                <p><span className="font-medium text-foreground">Received:</span> {new Date(data.received_at).toLocaleString()}</p>
                {data.has_attachments && (
                  <p className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> {data.attachments?.length} attachment(s)</p>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                {data.body_html ? (
                  <iframe
                    srcDoc={data.body_html}
                    className="w-full min-h-[300px]"
                    sandbox="allow-popups"
                    title="email-body"
                  />
                ) : (
                  <pre className="p-4 text-sm whitespace-pre-wrap font-sans">{data.body_text}</pre>
                )}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailInboxPage() {
  const qc = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inbox-emails", page, unreadOnly],
    queryFn: () => inboxApi.listEmails({ page, page_size: 50, unread_only: unreadOnly }),
  });

  const pollMut = useMutation({
    mutationFn: inboxApi.poll,
    onSuccess: () => {
      toast.success("Polling inbox…");
      setTimeout(() => refetch(), 2000);
    },
    onError: e => toast.error(e.response?.data?.detail || "Poll failed"),
  });

  const emails = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" /> Email Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Inbound emails fetched from your connected IMAP account</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={unreadOnly} onCheckedChange={v => { setUnreadOnly(v); setPage(1); }} />
            Unread only
          </label>
          <Button size="sm" variant="outline" onClick={() => pollMut.mutate()} disabled={pollMut.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${pollMut.isPending ? "animate-spin" : ""}`} /> Fetch new
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> IMAP Settings
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : emails.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-20 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No emails yet</p>
          <p className="text-xs text-muted-foreground mt-1">Configure your IMAP settings and click "Fetch new"</p>
          <Button size="sm" className="mt-4" variant="outline" onClick={() => setShowConfig(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Configure IMAP
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          {emails.map((email, i) => (
            <div
              key={email.id}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${i < emails.length - 1 ? "border-b" : ""} ${!email.is_read ? "bg-primary/5" : ""}`}
              onClick={() => setSelectedEmailId(email.id)}
            >
              <div className="mt-1 shrink-0">
                {!email.is_read ? (
                  <Circle className="h-2 w-2 fill-primary text-primary" />
                ) : (
                  <Circle className="h-2 w-2 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm truncate ${!email.is_read ? "font-semibold" : ""}`}>{email.from_name || email.from_email}</p>
                  {email.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                  {email.linked_record_id && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                      <ExternalLink className="h-2.5 w-2.5 mr-0.5" /> linked
                    </Badge>
                  )}
                </div>
                <p className={`text-sm truncate ${!email.is_read ? "text-foreground" : "text-muted-foreground"}`}>{email.subject}</p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0 mt-0.5">{fmtSmart(email.received_at).label}</p>
            </div>
          ))}
        </div>
      )}

      {total > 50 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{total} emails</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {showConfig && <InboxConfigDialog open onClose={() => setShowConfig(false)} />}
      {selectedEmailId && <EmailDetailDialog emailId={selectedEmailId} onClose={() => setSelectedEmailId(null)} />}
    </div>
  );
}
