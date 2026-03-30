import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/shared/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import { Loader2, Mail, Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function EmailConfigPage() {
  const qc = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [form, setForm] = useState(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["tenant-email-config"],
    queryFn: () => apiClient.get("/tenants/email-config").then((r) => r.data),
  });

  const current = form ?? {
    smtp_host: config?.smtp_host ?? "",
    smtp_port: config?.smtp_port ?? 587,
    smtp_username: config?.smtp_username ?? "",
    smtp_password: "",  // never pre-fill password from API
    email_from: config?.email_from ?? "",
    email_from_name: config?.email_from_name ?? "",
    use_tls: config?.use_tls ?? true,
  };

  const set = (key) => (e) =>
    setForm((p) => ({ ...(p ?? current), [key]: e.target.value }));

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.put("/tenants/email-config", {
        ...current,
        smtp_port: Number(current.smtp_port),
        smtp_password: current.smtp_password || undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-email-config"] });
      setForm(null);
      toast.success("Email configuration saved");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const testMut = useMutation({
    mutationFn: () =>
      apiClient.post("/tenants/email-config/test", { recipient: testEmail }).then((r) => r.data),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Test email sent to ${testEmail}`);
      } else {
        toast.error(`Failed: ${data.message}`);
      }
      setTestOpen(false);
      setTestEmail("");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => apiClient.delete("/tenants/email-config"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-email-config"] });
      setForm(null);
      setResetOpen(false);
      toast.success("Email configuration reset to system defaults");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="h-6 w-48 animate-pulse bg-muted rounded" />
        <div className="h-80 animate-pulse bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Email Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure a custom SMTP server for sending user invitations and notifications.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        {config?.is_configured ? (
          <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
            Custom SMTP Active
          </Badge>
        ) : (
          <Badge variant="secondary">Using System Default</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">SMTP Settings</CardTitle>
          </div>
          <CardDescription className="text-xs">
            All outgoing emails from your workspace will use these settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                placeholder="smtp.gmail.com"
                value={current.smtp_host}
                onChange={set("smtp_host")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                placeholder="587"
                value={current.smtp_port}
                onChange={set("smtp_port")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-username">Username</Label>
            <Input
              id="smtp-username"
              placeholder="you@example.com"
              value={current.smtp_username}
              onChange={set("smtp_username")}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-password">
              Password{" "}
              {config?.smtp_password === "***" && !form?.smtp_password && (
                <span className="text-xs text-muted-foreground ml-1">(leave blank to keep existing)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="smtp-password"
                type={showPassword ? "text" : "password"}
                placeholder={config?.smtp_password === "***" ? "••••••••" : "Enter password"}
                value={current.smtp_password}
                onChange={set("smtp_password")}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-amber-600">
              SMTP password is stored as plain text and visible to workspace admins.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-from">From Email</Label>
              <Input
                id="email-from"
                placeholder="noreply@yourdomain.com"
                value={current.email_from}
                onChange={set("email_from")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-from-name">From Name</Label>
              <Input
                id="email-from-name"
                placeholder="Acme Corp"
                value={current.email_from_name}
                onChange={set("email_from_name")}
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Use TLS (STARTTLS)</p>
              <p className="text-xs text-muted-foreground">Recommended for port 587</p>
            </div>
            <Switch
              checked={current.use_tls}
              onCheckedChange={(v) => setForm((p) => ({ ...(p ?? current), use_tls: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setTestOpen(true)}
            disabled={!config?.is_configured}
          >
            Send Test Email
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setResetOpen(true)}
            disabled={!config?.is_configured}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to Default
          </Button>
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save configuration
        </Button>
      </div>

      {/* Test email dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="test-email">Recipient email</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button
              onClick={() => testMut.mutate()}
              disabled={!testEmail || testMut.isPending}
            >
              {testMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Email Configuration?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will remove your custom SMTP settings and revert to the system default mail server.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending}
            >
              {resetMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
