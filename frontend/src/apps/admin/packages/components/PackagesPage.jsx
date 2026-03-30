import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, MoreVertical, Trash2, Pencil, Database } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";

const packagesApi = {
  list: () => apiClient.get("/packages").then((r) => r.data),
  create: (data) => apiClient.post("/packages", data).then((r) => r.data),
  update: (id, data) => apiClient.put(`/packages/${id}`, data).then((r) => r.data),
  delete: (id) => apiClient.delete(`/packages/${id}`),
  seed: () => apiClient.post("/packages/seed").then((r) => r.data),
};

const EMPTY_FORM = {
  name: "",
  slug: "",
  is_active: true,
  price_monthly: 0,
  price_yearly: 0,
  sort_order: 0,
  limits: {
    max_apps: 3,
    max_records: 500,
    max_workflows: 1,
    max_users: 2,
    storage_mb: 100,
    ai_builder: false,
    allow_custom_domain: false,
    allow_white_label: false,
    allow_api_access: false,
    allow_webhooks: false,
    allow_advanced_reports: false,
    allow_sso: false,
    support_level: "community",
  },
};

export function PackagesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, object = edit
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: packagesApi.list,
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (pkg) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      slug: pkg.slug,
      is_active: pkg.is_active,
      price_monthly: pkg.price_monthly,
      price_yearly: pkg.price_yearly,
      sort_order: pkg.sort_order,
      limits: { ...EMPTY_FORM.limits, ...pkg.limits },
    });
    setDialogOpen(true);
  };

  const setField = (key) => (e) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const setLimit = (key) => (e) =>
    setForm((p) => ({ ...p, limits: { ...p.limits, [key]: e.target.type === "number" ? Number(e.target.value) : e.target.value } }));

  const setLimitBool = (key) => (val) =>
    setForm((p) => ({ ...p, limits: { ...p.limits, [key]: val } }));

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        price_monthly: Number(form.price_monthly),
        price_yearly: Number(form.price_yearly),
        sort_order: Number(form.sort_order),
      };
      return editing
        ? packagesApi.update(editing.id, payload)
        : packagesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      setDialogOpen(false);
      toast.success(editing ? "Package updated" : "Package created");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const deleteMut = useMutation({
    mutationFn: packagesApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success("Package deleted");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const seedMut = useMutation({
    mutationFn: packagesApi.seed,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success(data.message);
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Subscription Packages</h2>
          <p className="text-sm text-muted-foreground">Create and manage subscription plans for organizations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            <Database className="h-4 w-4 mr-2" />
            {seedMut.isPending ? "Seeding…" : "Seed Defaults"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Package
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Monthly</TableHead>
              <TableHead>Yearly</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : packages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No packages yet. Click "Seed Defaults" to get started.
                </TableCell>
              </TableRow>
            ) : (
              packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{pkg.slug}</TableCell>
                  <TableCell>${pkg.price_monthly}/mo</TableCell>
                  <TableCell>${pkg.price_yearly}/yr</TableCell>
                  <TableCell className="text-muted-foreground">{pkg.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={pkg.is_active ? "default" : "secondary"}>
                      {pkg.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(pkg)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteMut.mutate(pkg.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit: ${editing.name}` : "New Package"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  placeholder="Starter"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      name: e.target.value,
                      slug: editing ? p.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug *</Label>
                <Input
                  placeholder="starter"
                  value={form.slug}
                  onChange={setField("slug")}
                  className="font-mono"
                  disabled={!!editing}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Monthly Price ($)</Label>
                <Input type="number" min="0" value={form.price_monthly} onChange={setField("price_monthly")} />
              </div>
              <div className="space-y-1.5">
                <Label>Yearly Price ($)</Label>
                <Input type="number" min="0" value={form.price_yearly} onChange={setField("price_yearly")} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input type="number" min="0" value={form.sort_order} onChange={setField("sort_order")} />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-y border-border">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Show this plan on the billing page</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
            </div>

            {/* Limits */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan Limits</p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "max_apps", label: "Max Apps (-1 = unlimited)" },
                { key: "max_users", label: "Max Users (-1 = unlimited)" },
                { key: "max_records", label: "Max Records (-1 = unlimited)" },
                { key: "max_workflows", label: "Max Workflows (-1 = unlimited)" },
                { key: "storage_mb", label: "Storage (MB, -1 = unlimited)" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input type="number" min="-1" value={form.limits[key]} onChange={setLimit(key)} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Support Level</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.limits.support_level}
                  onChange={setLimit("support_level")}
                >
                  <option value="community">Community</option>
                  <option value="email">Email</option>
                  <option value="priority">Priority</option>
                  <option value="dedicated">Dedicated</option>
                </select>
              </div>
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature Flags</p>
            <div className="space-y-2">
              {[
                { key: "ai_builder", label: "AI Builder" },
                { key: "allow_custom_domain", label: "Custom Domain" },
                { key: "allow_white_label", label: "White Label" },
                { key: "allow_api_access", label: "API Access" },
                { key: "allow_webhooks", label: "Webhooks" },
                { key: "allow_advanced_reports", label: "Advanced Reports" },
                { key: "allow_sso", label: "SSO (LDAP/SAML)" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={!!form.limits[key]}
                    onCheckedChange={setLimitBool(key)}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={!form.name || !form.slug || saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Create Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
