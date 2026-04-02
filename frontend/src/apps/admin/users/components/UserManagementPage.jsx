import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  UserPlus,
  Users,
  MoreHorizontal,
  Shield,
  Ban,
  CheckCircle,
  Trash2,
  Edit,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { usersApi } from "../api/users.api";
import { rbacApi } from "../../rbac/api/rbac.api";
import { apiClient } from "@/shared/lib/api-client";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";

export function UserManagementPage() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [roleDialogUser, setRoleDialogUser] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [inviteForm, setInviteForm] = useState({
    email: "",
    full_name: "",
    roles: [],
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => usersApi.listUsers(),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: () => rbacApi.listRoles(),
  });

  const { data: emailConfig } = useQuery({
    queryKey: ["tenant-email-config"],
    queryFn: () => apiClient.get("/tenants/email-config").then((r) => r.data),
  });

  const emailConfigured = !!emailConfig?.is_configured;

  const inviteUser = useMutation({
    mutationFn: (data) => usersApi.inviteUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setInviteOpen(false);
      setInviteForm({ email: "", full_name: "", roles: [] });
      toast.success("User invited successfully");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to invite user"),
  });

  const updateUser = useMutation({
    mutationFn: ({ userId, data }) => usersApi.updateUser(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setEditUser(null);
      toast.success("User updated");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to update user"),
  });

  const removeUser = useMutation({
    mutationFn: (userId) => usersApi.removeUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("User deactivated");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to remove user"),
  });

  const assignRole = useMutation({
    mutationFn: ({ userId, roleName }) => rbacApi.assignRole(userId, roleName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setRoleDialogUser(null);
      setSelectedRole("");
      toast.success("Role assigned");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to assign role"),
  });

  const revokeRole = useMutation({
    mutationFn: ({ userId, roleName }) => rbacApi.removeRole(userId, roleName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Role revoked");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to revoke role"),
  });

  const deleteUser = useMutation({
    mutationFn: (userId) => usersApi.deleteUserPermanently(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setDeleteConfirmUser(null);
      toast.success("User permanently deleted");
    },
    onError: (e) =>
      toast.error(e?.response?.data?.detail || "Failed to delete user"),
  });

  const roleNames = roles.map((r) => r.name);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            User Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage team members, invite new users, and assign roles
          </p>
        </div>
        <Button
          onClick={() => {
            if (!emailConfigured) {
              toast.error("Please configure your email server in Settings → Email Config before inviting users.");
              return;
            }
            setInviteOpen(true);
          }}
          size="sm"
        >
          <UserPlus className="h-4 w-4 mr-1" /> Invite User
        </Button>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
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
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-10 text-muted-foreground"
                >
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          No roles
                        </span>
                      )}
                      {u.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="secondary"
                          className="text-xs cursor-pointer hover:bg-destructive/10"
                          onClick={() =>
                            revokeRole.mutate({
                              userId: u.id,
                              roleName: role,
                            })
                          }
                          title={`Click to revoke "${role}"`}
                        >
                          {role} ×
                        </Badge>
                      ))}
                      <Badge
                        variant="outline"
                        className="text-xs cursor-pointer hover:bg-primary/10"
                        onClick={() => setRoleDialogUser(u)}
                        title="Assign a role"
                      >
                        + Role
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge
                        variant="outline"
                        className="border-green-500/30 text-green-600"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-red-500/30 text-red-600"
                      >
                        <Ban className="h-3 w-3 mr-1" /> Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setEditUser({
                              ...u,
                              _form: {
                                full_name: u.full_name,
                                email: u.email,
                                is_active: u.is_active,
                                roles: u.roles ?? [],
                              },
                            })
                          }
                        >
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRoleDialogUser(u)}>
                          <Shield className="h-4 w-4 mr-2" /> Assign Role
                        </DropdownMenuItem>
                        {u.is_active ? (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => removeUser.mutate(u.id)}
                          >
                            <Ban className="h-4 w-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() =>
                              updateUser.mutate({
                                userId: u.id,
                                data: { is_active: true },
                              })
                            }
                          >
                            <CheckCircle className="h-4 w-4 mr-2" /> Reactivate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteConfirmUser(u)}
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

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          {!emailConfigured && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Email server is not configured.{" "}
                <Link to="/settings/email-config" className="underline font-medium">
                  Set up SMTP
                </Link>{" "}
                before inviting users.
              </span>
            </div>
          )}
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                placeholder="John Doe"
                value={inviteForm.full_name}
                onChange={(e) =>
                  setInviteForm((p) => ({ ...p, full_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((p) => ({ ...p, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Initial Role (optional)</Label>
              <Select
                value={inviteForm.roles[0] || ""}
                onValueChange={(val) =>
                  setInviteForm((p) => ({
                    ...p,
                    roles: val ? [val] : [],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteUser.mutate(inviteForm)}
              disabled={
                !emailConfigured ||
                !inviteForm.email ||
                !inviteForm.full_name ||
                inviteUser.isPending
              }
            >
              {inviteUser.isPending ? "Inviting…" : "Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={editUser._form.full_name}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      _form: { ...prev._form, full_name: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editUser._form.email}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      _form: { ...prev._form, email: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {roleNames.map((name) => {
                    const active = (editUser._form.roles ?? []).includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          const cur = editUser._form.roles ?? [];
                          const next = active
                            ? cur.filter((r) => r !== name)
                            : [...cur, name];
                          setEditUser((prev) => ({
                            ...prev,
                            _form: { ...prev._form, roles: next },
                          }));
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                          active
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                  {roleNames.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">
                      No roles defined yet
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-active-check"
                  checked={editUser._form.is_active}
                  onChange={(e) =>
                    setEditUser((prev) => ({
                      ...prev,
                      _form: { ...prev._form, is_active: e.target.checked },
                    }))
                  }
                  className="h-4 w-4"
                />
                <Label htmlFor="is-active-check">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                updateUser.mutate({
                  userId: editUser.id,
                  data: editUser._form,
                })
              }
              disabled={updateUser.isPending}
            >
              {updateUser.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Role Dialog */}
      <Dialog
        open={!!roleDialogUser}
        onOpenChange={() => {
          setRoleDialogUser(null);
          setSelectedRole("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign Role to {roleDialogUser?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleNames
                    .filter((name) => !roleDialogUser?.roles?.includes(name))
                    .map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {roleDialogUser?.roles?.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Current roles
                </Label>
                <div className="flex flex-wrap gap-1">
                  {roleDialogUser.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-xs">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRoleDialogUser(null);
                setSelectedRole("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                assignRole.mutate({
                  userId: roleDialogUser.id,
                  roleName: selectedRole,
                })
              }
              disabled={!selectedRole || assignRole.isPending}
            >
              {assignRole.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User Permanently?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently remove <strong>{deleteConfirmUser?.full_name}</strong> ({deleteConfirmUser?.email}) from your workspace. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteUser.mutate(deleteConfirmUser?.id)}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
