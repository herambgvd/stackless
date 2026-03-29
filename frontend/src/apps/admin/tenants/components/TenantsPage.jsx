import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MoreVertical, Trash2 } from "lucide-react";
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

const PLAN_VARIANTS = {
  free: "secondary",
  starter: "outline",
  business: "default",
  enterprise: "success",
};

export function TenantsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
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
