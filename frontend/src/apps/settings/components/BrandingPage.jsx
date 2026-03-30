import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/store/auth.store";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/shared/components/ui/card";
import { Loader2, Palette, Globe } from "lucide-react";
import { toast } from "sonner";

export function BrandingPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const tenantId = user?.tenant_id;

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => apiClient.get(`/tenants/${tenantId}`).then((r) => r.data),
    enabled: !!tenantId,
  });

  const branding = tenant?.settings?.branding ?? {};

  const [form, setForm] = useState(null);
  const current = form ?? {
    logo_url: branding.logo_url ?? "",
    favicon_url: branding.favicon_url ?? "",
    primary_color: branding.primary_color ?? "#6366f1",
    secondary_color: branding.secondary_color ?? "#8b5cf6",
    domain: branding.domain ?? "",
  };

  const set = (key) => (e) => setForm((p) => ({ ...(p ?? current), [key]: e.target.value }));

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.put(`/tenants/${tenantId}`, { branding: current }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant", tenantId] });
      setForm(null);
      toast.success("Branding saved");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="h-6 w-48 animate-pulse bg-muted rounded" />
        <div className="h-64 animate-pulse bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Branding & Whitelabel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your workspace appearance with your own logo, colors, and domain.
        </p>
      </div>

      {/* Visual identity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Visual Identity</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Set your logo, favicon, and brand colors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              placeholder="https://example.com/logo.png"
              value={current.logo_url}
              onChange={set("logo_url")}
            />
            {current.logo_url && (
              <img
                src={current.logo_url}
                alt="Logo preview"
                className="h-10 mt-1 rounded object-contain border border-border p-1"
                onError={(e) => (e.target.style.display = "none")}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="favicon-url">Favicon URL</Label>
            <Input
              id="favicon-url"
              placeholder="https://example.com/favicon.ico"
              value={current.favicon_url}
              onChange={set("favicon_url")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={current.primary_color}
                  onChange={set("primary_color")}
                  className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                />
                <Input
                  value={current.primary_color}
                  onChange={set("primary_color")}
                  className="font-mono uppercase"
                  maxLength={7}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secondary-color">Secondary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="secondary-color"
                  type="color"
                  value={current.secondary_color}
                  onChange={set("secondary_color")}
                  className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                />
                <Input
                  value={current.secondary_color}
                  onChange={set("secondary_color")}
                  className="font-mono uppercase"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom domain */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Custom Domain</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Serve your workspace on your own domain. Contact support to activate DNS routing after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              placeholder="app.yourdomain.com"
              value={current.domain}
              onChange={set("domain")}
            />
            <p className="text-xs text-muted-foreground">
              After saving, contact support to configure DNS and activate your domain.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save branding
        </Button>
      </div>
    </div>
  );
}
