import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/shared/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, Save, RotateCcw, Shield, Database, Globe, Lock } from "lucide-react";
import { toast } from "sonner";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo",
  "Asia/Shanghai", "Asia/Dubai", "Australia/Sydney", "Pacific/Auckland",
];

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "CNY", "AED"];

const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "DD.MM.YYYY"];

export function TenantConfigPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [activeSection, setActiveSection] = useState("general");

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-config"],
    queryFn: () => apiClient.get("/tenants/config").then((r) => r.data),
  });

  const config = data?.config ?? {};

  const saveMut = useMutation({
    mutationFn: (payload) => apiClient.put("/tenants/config", payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-config"] });
      setForm(null);
      toast.success("Configuration saved");
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed to save"),
  });

  const resetMut = useMutation({
    mutationFn: () => apiClient.delete("/tenants/config"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-config"] });
      setForm(null);
      toast.success("Configuration reset to defaults");
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed to reset"),
  });

  const current = form ?? config;

  function updateField(section, field, value) {
    setForm((prev) => {
      const base = prev ?? { ...config };
      return {
        ...base,
        [section]: { ...(base[section] || {}), [field]: value },
      };
    });
  }

  function updateTopLevel(field, value) {
    setForm((prev) => ({ ...(prev ?? { ...config }), [field]: value }));
  }

  function handleSave() {
    if (!form) return;
    saveMut.mutate(form);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sections = [
    { id: "general", label: "General", icon: Globe },
    { id: "storage", label: "Storage", icon: Database },
    { id: "security", label: "Security", icon: Shield },
    { id: "oauth", label: "OAuth / SSO", icon: Lock },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenant Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Override platform defaults for your workspace. Empty fields use system defaults.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => resetMut.mutate()} disabled={resetMut.isPending}>
            {resetMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            Reset All
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!form || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-border">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeSection === s.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* General Section */}
      {activeSection === "general" && (
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Locale, timezone, and formatting preferences for your workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={current.timezone || "UTC"}
                  onValueChange={(v) => updateTopLevel("timezone", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={current.currency || "USD"}
                  onValueChange={(v) => updateTopLevel("currency", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Format</Label>
                <Select
                  value={current.date_format || "YYYY-MM-DD"}
                  onValueChange={(v) => updateTopLevel("date_format", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Custom Domain</Label>
                <Input
                  placeholder="app.yourdomain.com"
                  value={current.custom_domain || ""}
                  onChange={(e) => updateTopLevel("custom_domain", e.target.value || null)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storage Section */}
      {activeSection === "storage" && (
        <Card>
          <CardHeader>
            <CardTitle>Object Storage (S3-Compatible)</CardTitle>
            <CardDescription>Override the platform storage with your own S3-compatible endpoint. Leave empty to use system defaults.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Input
                  placeholder="s3.amazonaws.com"
                  value={current.storage?.endpoint || ""}
                  onChange={(e) => updateField("storage", "endpoint", e.target.value || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Bucket Name</Label>
                <Input
                  placeholder="my-bucket"
                  value={current.storage?.bucket_name || ""}
                  onChange={(e) => updateField("storage", "bucket_name", e.target.value || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Access Key</Label>
                <Input
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={current.storage?.access_key || ""}
                  onChange={(e) => updateField("storage", "access_key", e.target.value || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Secret Key</Label>
                <Input
                  type="password"
                  placeholder="Enter secret key"
                  value={current.storage?.secret_key || ""}
                  onChange={(e) => updateField("storage", "secret_key", e.target.value || null)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={current.storage?.use_ssl ?? false}
                onCheckedChange={(v) => updateField("storage", "use_ssl", v)}
              />
              <Label>Use SSL</Label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Section */}
      {activeSection === "security" && (
        <Card>
          <CardHeader>
            <CardTitle>Security & Rate Limiting</CardTitle>
            <CardDescription>Control rate limits, upload sizes, and session behavior for your workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rate Limit (requests/window)</Label>
                <Input
                  type="number"
                  placeholder="300 (default)"
                  value={current.security?.rate_limit_requests ?? ""}
                  onChange={(e) => updateField("security", "rate_limit_requests", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Rate Limit Window (seconds)</Label>
                <Input
                  type="number"
                  placeholder="60 (default)"
                  value={current.security?.rate_limit_window_seconds ?? ""}
                  onChange={(e) => updateField("security", "rate_limit_window_seconds", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Upload Size (MB)</Label>
                <Input
                  type="number"
                  placeholder="25 (default)"
                  value={current.security?.max_upload_size_mb ?? ""}
                  onChange={(e) => updateField("security", "max_upload_size_mb", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Session Timeout (minutes)</Label>
                <Input
                  type="number"
                  placeholder="30 (default)"
                  value={current.security?.session_timeout_minutes ?? ""}
                  onChange={(e) => updateField("security", "session_timeout_minutes", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* OAuth Section */}
      {activeSection === "oauth" && (
        <Card>
          <CardHeader>
            <CardTitle>OAuth / SSO Providers</CardTitle>
            <CardDescription>Configure your own OAuth credentials for Google and GitHub SSO. Leave empty to use platform defaults.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Google</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    placeholder="your-google-client-id"
                    value={current.oauth?.google_client_id || ""}
                    onChange={(e) => updateField("oauth", "google_client_id", e.target.value || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    placeholder="Enter client secret"
                    value={current.oauth?.google_client_secret || ""}
                    onChange={(e) => updateField("oauth", "google_client_secret", e.target.value || null)}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">GitHub</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    placeholder="your-github-client-id"
                    value={current.oauth?.github_client_id || ""}
                    onChange={(e) => updateField("oauth", "github_client_id", e.target.value || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    placeholder="Enter client secret"
                    value={current.oauth?.github_client_secret || ""}
                    onChange={(e) => updateField("oauth", "github_client_secret", e.target.value || null)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
