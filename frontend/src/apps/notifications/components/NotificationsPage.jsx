import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Bell,
  Trash2,
  Send,
  Mail,
  MessageSquare,
  Globe,
  Inbox,
  X,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { notificationsApi } from "../api/notifications.api";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { fmtSmart } from "@/shared/lib/date";

// ── Tag Input (for template variables list) ───────────────────────────────────
function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim().replace(/\s+/g, "_");
    if (!v || tags.includes(v)) { setInput(""); return; }
    onChange([...tags, v]);
    setInput("");
  }

  function remove(tag) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[32px] rounded-md border border-input bg-background px-3 py-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs text-primary font-medium"
          >
            {`{{${t}}}`}
            <button type="button" onClick={() => remove(t)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[120px]"
          placeholder={tags.length === 0 ? placeholder : "add variable…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add. Use in templates as {`{{variable_name}}`}.
      </p>
    </div>
  );
}

// ── Context Key-Value builder (for send notification) ─────────────────────────
function ContextEditor({ value, onChange, hints = [] }) {
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
      {hints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hints
            .filter((h) => !value[h])
            .map((h) => (
              <button
                key={h}
                type="button"
                className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={() => onChange({ ...value, [h]: "" })}
              >
                + {h}
              </button>
            ))}
        </div>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="text-xs font-mono bg-muted px-2 py-1 rounded shrink-0">{k}</span>
          <Input
            className="h-7 text-xs flex-1"
            value={v}
            placeholder="value"
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
          />
          <button type="button" onClick={() => remove(k)} className="text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
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
        <button
          type="button"
          onClick={add}
          disabled={!newKey.trim()}
          className="shrink-0 rounded-md border border-input px-2 text-xs hover:bg-accent disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const CHANNEL_ICONS = {
  email: Mail,
  slack: MessageSquare,
  webhook: Globe,
  in_app: Inbox,
};

const CHANNELS = ["email", "slack", "webhook", "in_app"];

export function NotificationsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null); // template object being edited
  const [templateForm, setTemplateForm] = useState({
    name: "",
    channel: "email",
    subject_template: "",
    body_template: "",
    variables: [],
  });
  const [sendForm, setSendForm] = useState({
    channel: "email",
    recipient: "",
    template_id: "",
    subject: "",
    body: "",
    context: {},
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["notifications", "templates"],
    queryFn: () => notificationsApi.listTemplates(),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["notifications", "logs"],
    queryFn: () => notificationsApi.listLogs(),
  });

  const createTemplate = useMutation({
    mutationFn: () => notificationsApi.createTemplate(templateForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "templates"] });
      setCreateOpen(false);
      setTemplateForm({
        name: "",
        channel: "email",
        subject_template: "",
        body_template: "",
        variables: [],
      });
      toast.success("Template created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id) => notificationsApi.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "templates"] });
      toast.success("Template deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTemplateMut = useMutation({
    mutationFn: ({ id, data }) => notificationsApi.updateTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "templates"] });
      setEditTemplate(null);
      toast.success("Template updated");
    },
    onError: (e) => toast.error(e.message),
  });

  function openEditDialog(tmpl) {
    setEditTemplate({
      id: tmpl.id,
      name: tmpl.name,
      subject_template: tmpl.subject_template,
      body_template: tmpl.body_template,
      variables: tmpl.variables ?? [],
      is_active: tmpl.is_active,
    });
  }

  const sendNotification = useMutation({
    mutationFn: () => notificationsApi.send(sendForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "logs"] });
      setSendOpen(false);
      setSendForm({
        channel: "email",
        recipient: "",
        template_id: "",
        subject: "",
        body: "",
        context: {},
      });
      toast.success("Notification sent");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Manage notification templates and delivery logs
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="logs">Delivery Logs</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setSendOpen(true)}
              size="sm"
            >
              <Send className="h-4 w-4" /> Send Notification
            </Button>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4" /> New Template
            </Button>
          </div>

          {templatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-foreground">No templates</p>
              <p className="text-sm text-muted-foreground">
                Create a notification template to get started
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tmpl) => {
                const Icon = CHANNEL_ICONS[tmpl.channel] ?? Bell;
                return (
                  <Card key={tmpl.id}>
                    <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">{tmpl.name}</CardTitle>
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {tmpl.channel}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditDialog(tmpl)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteTemplate.mutate(tmpl.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {tmpl.subject_template && (
                        <p className="text-xs text-muted-foreground truncate">
                          Subject: {tmpl.subject_template}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {tmpl.body_template}
                      </p>
                      {tmpl.variables?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tmpl.variables.map((v) => (
                            <Badge
                              key={v}
                              variant="secondary"
                              className="text-xs"
                            >
                              {v}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No logs yet
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.recipient}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.status === "sent"
                              ? "default"
                              : log.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.sent_at
                          ? (() => { const { label, title } = fmtSmart(log.sent_at); return <span title={title}>{label}</span>; })()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-destructive truncate max-w-[200px]">
                        {log.error ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Template dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template name *</Label>
              <Input
                placeholder="e.g. Welcome Email"
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Channel *</Label>
              <Select
                value={templateForm.channel}
                onValueChange={(v) =>
                  setTemplateForm((p) => ({ ...p, channel: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject template</Label>
              <Input
                placeholder="e.g. Welcome, {{name}}!"
                value={templateForm.subject_template}
                onChange={(e) =>
                  setTemplateForm((p) => ({
                    ...p,
                    subject_template: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Body template *</Label>
              <Textarea
                placeholder="Hello {{name}}, your account has been created."
                rows={4}
                value={templateForm.body_template}
                onChange={(e) =>
                  setTemplateForm((p) => ({
                    ...p,
                    body_template: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Variables</Label>
              <TagInput
                tags={templateForm.variables}
                onChange={(v) => setTemplateForm((p) => ({ ...p, variables: v }))}
                placeholder="e.g. name, email, link…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTemplate.mutate()}
              disabled={
                !templateForm.name.trim() ||
                !templateForm.body_template.trim() ||
                createTemplate.isPending
              }
            >
              {createTemplate.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template dialog */}
      {editTemplate && (
        <Dialog open={!!editTemplate} onOpenChange={(o) => { if (!o) setEditTemplate(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Template name *</Label>
                <Input
                  value={editTemplate.name}
                  onChange={(e) => setEditTemplate((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject template</Label>
                <Input
                  value={editTemplate.subject_template}
                  onChange={(e) => setEditTemplate((p) => ({ ...p, subject_template: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Body template *</Label>
                <Textarea
                  rows={4}
                  value={editTemplate.body_template}
                  onChange={(e) => setEditTemplate((p) => ({ ...p, body_template: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Variables</Label>
                <TagInput
                  tags={editTemplate.variables}
                  onChange={(v) => setEditTemplate((p) => ({ ...p, variables: v }))}
                  placeholder="e.g. name, email…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTemplate(null)}>Cancel</Button>
              <Button
                onClick={() =>
                  updateTemplateMut.mutate({
                    id: editTemplate.id,
                    data: {
                      name: editTemplate.name,
                      subject_template: editTemplate.subject_template,
                      body_template: editTemplate.body_template,
                      variables: editTemplate.variables,
                    },
                  })
                }
                disabled={!editTemplate.name.trim() || !editTemplate.body_template.trim() || updateTemplateMut.isPending}
              >
                {updateTemplateMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Send Notification dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Channel *</Label>
              <Select
                value={sendForm.channel}
                onValueChange={(v) =>
                  setSendForm((p) => ({ ...p, channel: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recipient *</Label>
              <Input
                placeholder="email@example.com or user ID"
                value={sendForm.recipient}
                onChange={(e) =>
                  setSendForm((p) => ({ ...p, recipient: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Template (optional)</Label>
              <Select
                value={sendForm.template_id}
                onValueChange={(v) =>
                  setSendForm((p) => ({ ...p, template_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!sendForm.template_id && (
              <>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={sendForm.subject}
                    onChange={(e) =>
                      setSendForm((p) => ({ ...p, subject: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Body *</Label>
                  <Textarea
                    rows={3}
                    value={sendForm.body}
                    onChange={(e) =>
                      setSendForm((p) => ({ ...p, body: e.target.value }))
                    }
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Context (template variables)</Label>
              <ContextEditor
                value={sendForm.context}
                onChange={(ctx) => setSendForm((p) => ({ ...p, context: ctx }))}
                hints={
                  sendForm.template_id
                    ? (templates.find((t) => t.id === sendForm.template_id)?.variables ?? [])
                    : []
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => sendNotification.mutate()}
              disabled={
                !sendForm.recipient.trim() || sendNotification.isPending
              }
            >
              {sendNotification.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
