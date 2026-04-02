import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { rbacApi } from "../api/rbac.api";
import { schemaApi } from "@/apps/app-builder/api/schema.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────

const COMMON_ACTIONS = ["create", "read", "update", "delete", "execute"];

const SYSTEM_RESOURCES = [
  { value: "records", label: "Records" },
  { value: "apps", label: "Apps" },
  { value: "schema", label: "Schema / Models" },
  { value: "users", label: "Users" },
  { value: "reports", label: "Reports" },
  { value: "workflows", label: "Workflows" },
  { value: "approvals", label: "Approvals" },
  { value: "notifications", label: "Notifications" },
  { value: "admin", label: "Administration" },
  { value: "portal", label: "Portal" },
  { value: "integrations", label: "Integrations" },
  { value: "dashboard", label: "Dashboard" },
  { value: "email", label: "Email Inbox" },
  { value: "comments", label: "Comments" },
  { value: "files", label: "Files / Attachments" },
];

const EMPTY_ROLE_FORM = {
  name: "",
  description: "",
  app_id: "",
  permissions: [],
};

// ── Permission Builder ─────────────────────────────────────────────────────────

function PermissionBuilder({ permissions, onChange }) {
  const [resource, setResource] = useState("");
  const [actions, setActions] = useState([]);
  const [customAction, setCustomAction] = useState("");

  function toggleAction(action) {
    setActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
  }

  function selectAllActions() {
    setActions([...COMMON_ACTIONS]);
  }

  function addCustomAction() {
    const a = customAction.trim().toLowerCase();
    if (!a || actions.includes(a)) return;
    setActions((prev) => [...prev, a]);
    setCustomAction("");
  }

  function addPermission() {
    if (!resource.trim() || actions.length === 0) return;
    const existing = permissions.findIndex((p) => p.resource === resource.trim());
    if (existing >= 0) {
      const updated = [...permissions];
      updated[existing] = { resource: resource.trim(), actions };
      onChange(updated);
    } else {
      onChange([...permissions, { resource: resource.trim(), actions }]);
    }
    setResource("");
    setActions([]);
  }

  function removePermission(idx) {
    onChange(permissions.filter((_, i) => i !== idx));
  }

  const resourceLabel = (val) => SYSTEM_RESOURCES.find((r) => r.value === val)?.label || val;

  return (
    <div className="space-y-3">
      <Label>Permissions</Label>

      {/* Existing permissions */}
      {permissions.length > 0 && (
        <div className="space-y-1.5">
          {permissions.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
            >
              <span className="text-xs font-semibold text-foreground min-w-0 flex-1 truncate">
                {resourceLabel(p.resource)}
              </span>
              <div className="flex flex-wrap gap-1">
                {p.actions.map((a) => (
                  <Badge key={a} variant="secondary" className="text-xs px-1.5 py-0">
                    {a}
                  </Badge>
                ))}
              </div>
              <button
                type="button"
                onClick={() => removePermission(i)}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add permission row */}
      <div className="rounded-md border border-dashed border-border p-3 space-y-2.5">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Resource *</p>
          <Select value={resource} onValueChange={setResource}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select resource..." />
            </SelectTrigger>
            <SelectContent>
              {SYSTEM_RESOURCES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Actions *</p>
            <button
              type="button"
              className="text-[10px] text-primary hover:underline"
              onClick={selectAllActions}
            >
              Select all
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {COMMON_ACTIONS.map((a) => (
              <label key={a} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={actions.includes(a)}
                  onCheckedChange={() => toggleAction(a)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-foreground">{a}</span>
              </label>
            ))}
          </div>
          {/* Custom action */}
          <div className="flex gap-2">
            <Input
              placeholder="Custom action…"
              value={customAction}
              onChange={(e) => setCustomAction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomAction()}
              className="h-7 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={addCustomAction}
              disabled={!customAction.trim()}
            >
              Add
            </Button>
          </div>
          {actions.filter((a) => !COMMON_ACTIONS.includes(a)).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {actions
                .filter((a) => !COMMON_ACTIONS.includes(a))
                .map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="text-xs cursor-pointer hover:bg-destructive/10"
                    onClick={() => toggleAction(a)}
                  >
                    {a} <X className="h-2.5 w-2.5 ml-1" />
                  </Badge>
                ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={!resource.trim() || actions.length === 0}
          onClick={addPermission}
        >
          <Plus className="h-3 w-3" />
          Add Permission
        </Button>
      </div>
    </div>
  );
}

// ── Role Form Dialog ───────────────────────────────────────────────────────────

function RoleDialog({ open, onOpenChange, initial, onSave, isPending, title, apps = [] }) {
  const [form, setForm] = useState(initial);

  const handleOpen = (o) => {
    if (o) setForm(initial);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Role name *</Label>
            <Input
              placeholder="e.g. editor"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="What can this role do?"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>App scope</Label>
            <p className="text-xs text-muted-foreground">Restrict this role to a specific app, or leave as "Global" for all apps.</p>
            <Select
              value={form.app_id || "__global__"}
              onValueChange={(v) => setForm((p) => ({ ...p, app_id: v === "__global__" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Global (all apps)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global (all apps)</SelectItem>
                {apps.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <PermissionBuilder
            permissions={form.permissions}
            onChange={(perms) => setForm((p) => ({ ...p, permissions: perms }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || isPending}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Permissions cell display ───────────────────────────────────────────────────

function PermissionsCell({ permissions }) {
  if (!permissions?.length)
    return <span className="text-xs text-muted-foreground italic">none</span>;

  const resourceLabel = (val) => SYSTEM_RESOURCES.find((r) => r.value === val)?.label || val;
  const visible = permissions.slice(0, 2);
  const rest = permissions.length - 2;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((p, i) => (
        <Badge key={i} variant="outline" className="text-xs font-mono">
          {resourceLabel(p.resource)}: {p.actions?.join(", ")}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{rest} more
        </Badge>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function RbacPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: () => rbacApi.listRoles(),
  });

  // Fetch apps for the dropdown
  const { data: apps = [] } = useQuery({
    queryKey: ["apps"],
    queryFn: () => schemaApi.listApps(),
  });

  // Build app_id → name lookup
  const appNameMap = {};
  for (const app of apps) {
    appNameMap[app.id] = app.name;
  }

  const createRole = useMutation({
    mutationFn: (data) => rbacApi.createRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      setCreateOpen(false);
      toast.success("Role created");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, data }) => rbacApi.updateRole(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      setEditTarget(null);
      toast.success("Role updated");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const deleteRole = useMutation({
    mutationFn: (roleId) => rbacApi.deleteRole(roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      toast.success("Role deleted");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  function handleCreate(form) {
    const payload = {
      name: form.name.trim(),
      description: form.description,
      permissions: form.permissions,
    };
    if (form.app_id.trim()) payload.app_id = form.app_id.trim();
    createRole.mutate(payload);
  }

  function handleUpdate(form) {
    const payload = {
      name: form.name.trim(),
      description: form.description,
      permissions: form.permissions,
    };
    if (form.app_id.trim()) payload.app_id = form.app_id.trim();
    updateRole.mutate({ id: editTarget.id, data: payload });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Roles & Permissions</h2>
        <p className="text-sm text-muted-foreground">
          Manage roles and permissions across your organization
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> New Role
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>App Scope</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rolesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No roles defined
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {role.name}
                    {role.is_system_role && (
                      <Badge variant="secondary" className="ml-2 text-xs">system</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {role.description || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {role.app_id ? (
                      <Badge variant="outline" className="text-xs">
                        {appNameMap[role.app_id] || role.app_id}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Global</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PermissionsCell permissions={role.permissions} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        disabled={role.is_system_role}
                        onClick={() =>
                          setEditTarget({
                            ...role,
                            app_id: role.app_id ?? "",
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={role.is_system_role}
                        onClick={() => deleteRole.mutate(role.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Role dialog */}
      <RoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={EMPTY_ROLE_FORM}
        onSave={handleCreate}
        isPending={createRole.isPending}
        title="Create Role"
        apps={apps}
      />

      {/* Edit Role dialog */}
      {editTarget && (
        <RoleDialog
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          initial={{
            name: editTarget.name,
            description: editTarget.description ?? "",
            app_id: editTarget.app_id ?? "",
            permissions: editTarget.permissions ?? [],
          }}
          onSave={handleUpdate}
          isPending={updateRole.isPending}
          title="Edit Role"
          apps={apps}
        />
      )}
    </div>
  );
}
