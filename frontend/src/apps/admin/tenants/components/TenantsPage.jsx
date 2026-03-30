import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MoreVertical, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { tenantsApi } from "../api/tenants.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Separator } from "@/shared/components/ui/separator";
import { fmtSmart } from "@/shared/lib/date";
import { apiClient } from "@/shared/lib/api-client";

const PLAN_VARIANTS = {
  free: "secondary",
  starter: "outline",
  business: "default",
  enterprise: "success",
};

const PLAN_ORDER = ["free", "starter", "growth", "business", "enterprise"];

export function TenantsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planTenant, setPlanTenant] = useState(null); // { id, name, plan }
  const [selectedPlan, setSelectedPlan] = useState("");
  const [planError, setPlanError] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    plan: "free",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: tenantsApi.list,
  });

  const create = useMutation({
    mutationFn: tenantsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setCreateOpen(false);
      setForm({
        name: "",
        slug: "",
        plan: "free",
        admin_name: "",
        admin_email: "",
        admin_password: "",
      });
      toast.success("Organization created with admin user");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: () => apiClient.get("/packages").then((r) => r.data),
  });

  const openPlanDialog = (t) => {
    setPlanTenant(t);
    setSelectedPlan(t.plan);
    setPlanError("");
    setPlanOpen(true);
  };

  const changePlan = useMutation({
    mutationFn: () => tenantsApi.update(planTenant.id, { plan: selectedPlan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setPlanOpen(false);
      toast.success(`Plan changed to ${selectedPlan}`);
    },
    onError: (e) => setPlanError(e.response?.data?.detail || e.message),
  });

  const del = useMutation({
    mutationFn: tenantsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Organizations
          </h2>
          <p className="text-sm text-muted-foreground">
            Onboard and manage organizations
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Organization
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground"
                >
                  <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No organizations yet
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {t.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={PLAN_VARIANTS[t.plan] ?? "secondary"}>
                      {t.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {(() => { const { label, title } = fmtSmart(t.created_at); return <span title={title}>{label}</span>; })()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openPlanDialog(t)}>
                          <Pencil className="h-4 w-4 mr-2" /> Change Plan
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => del.mutate(t.id)}
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

      {/* Change Plan dialog */}
      <Dialog open={planOpen} onOpenChange={(v) => { setPlanOpen(v); setPlanError(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Plan{planTenant ? ` — ${planTenant.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Plan</Label>
              {packages.length > 0 ? (
                <div className="space-y-1.5">
                  {packages.map((pkg) => (
                    <label key={pkg.slug} className="flex items-center gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-accent transition-colors">
                      <input
                        type="radio"
                        name="plan"
                        value={pkg.slug}
                        checked={selectedPlan === pkg.slug}
                        onChange={() => { setSelectedPlan(pkg.slug); setPlanError(""); }}
                        className="accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{pkg.name}</p>
                        <p className="text-xs text-muted-foreground">${pkg.price_monthly}/mo</p>
                      </div>
                      {planTenant?.plan === pkg.slug && (
                        <Badge variant="secondary" className="text-xs">Current</Badge>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                // Fallback if packages API returns empty
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedPlan}
                  onChange={(e) => { setSelectedPlan(e.target.value); setPlanError(""); }}
                >
                  {["free", "starter", "growth", "business", "enterprise"].map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              )}
            </div>
            {selectedPlan && planTenant &&
              PLAN_ORDER.indexOf(selectedPlan) < PLAN_ORDER.indexOf(planTenant.plan) && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-md p-2.5">
                ⚠️ Downgrading may restrict features if current usage exceeds the new plan limits.
              </p>
            )}
            {planError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md p-2.5">{planError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button
              onClick={() => changePlan.mutate()}
              disabled={selectedPlan === planTenant?.plan || changePlan.isPending}
            >
              {changePlan.isPending ? "Saving…" : "Save Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Onboard Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Organization Details
            </p>
            <div className="space-y-2">
              <Label>Organization Name *</Label>
              <Input
                placeholder="Acme Corp"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    name: e.target.value,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Slug *</Label>
              <Input
                placeholder="acme-corp"
                value={form.slug}
                onChange={(e) =>
                  setForm((p) => ({ ...p, slug: e.target.value }))
                }
                className="font-mono"
              />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Organization Admin
            </p>
            <div className="space-y-2">
              <Label>Admin Name *</Label>
              <Input
                placeholder="John Doe"
                value={form.admin_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, admin_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Admin Email *</Label>
              <Input
                type="email"
                placeholder="admin@acme-corp.com"
                value={form.admin_email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, admin_email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Admin Password *</Label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={form.admin_password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, admin_password: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate(form)}
              disabled={
                !form.name ||
                !form.slug ||
                !form.admin_email ||
                !form.admin_name ||
                !form.admin_password ||
                form.admin_password.length < 8 ||
                create.isPending
              }
            >
              {create.isPending ? "Creating…" : "Create Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
