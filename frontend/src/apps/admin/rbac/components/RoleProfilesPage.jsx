import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Layers, X, Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { rbacApi } from "../api/rbac.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

function ProfileDialog({ open, onClose, title, initial, onSave, isPending, allRoles }) {
  const [form, setForm] = useState(initial);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleRole(roleName) {
    const current = form.roles ?? [];
    if (current.includes(roleName)) {
      set("roles", current.filter((r) => r !== roleName));
    } else {
      set("roles", [...current, roleName]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Profile Name</Label>
            <Input
              className="mt-1"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Sales Team, Field Agent"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              className="mt-1 min-h-[60px] text-sm"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this profile for?"
            />
          </div>
          <div>
            <Label className="block mb-2">Bundled Roles</Label>
            {allRoles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No roles found. Create roles first.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-3">
                {allRoles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={(form.roles ?? []).includes(role.name)}
                      onCheckedChange={() => toggleRole(role.name)}
                    />
                    <label
                      htmlFor={`role-${role.id}`}
                      className="text-sm cursor-pointer flex items-center gap-2"
                    >
                      {role.name}
                      {role.is_system_role && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">system</Badge>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {(form.roles ?? []).length} role{(form.roles ?? []).length !== 1 ? "s" : ""} selected
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || isPending}
          >
            {title.startsWith("Edit") ? "Update" : "Create"} Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onClose, profile, allUsers, onAssign, isPending }) {
  const [userId, setUserId] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Profile: {profile?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Select a user to apply the <strong>{profile?.roles?.length ?? 0}</strong> role{profile?.roles?.length !== 1 ? "s" : ""} in this profile.
          </p>
          <div>
            <Label>User</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Select user…</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onAssign(userId)}
            disabled={!userId || isPending}
          >
            Apply Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY = { name: "", description: "", roles: [] };

export function RoleProfilesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["role-profiles"],
    queryFn: rbacApi.listRoleProfiles,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: rbacApi.listRoles,
  });

  // Fetch users for assign dialog
  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { apiClient } = await import("@/shared/lib/api-client");
      const res = await apiClient.get("/users");
      return res.data?.items ?? res.data ?? [];
    },
    enabled: !!assignTarget,
  });

  const createMut = useMutation({
    mutationFn: rbacApi.createRoleProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-profiles"] });
      toast.success("Profile created");
      setCreateOpen(false);
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to create profile"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => rbacApi.updateRoleProfile(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-profiles"] });
      toast.success("Profile updated");
      setEditTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: rbacApi.deleteRoleProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-profiles"] });
      toast.success("Profile deleted");
    },
  });

  const assignMut = useMutation({
    mutationFn: ({ profileId, userId }) => rbacApi.assignProfileToUser(profileId, userId),
    onSuccess: (data) => {
      toast.success(data.detail || "Profile applied");
      setAssignTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to assign"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            Role Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bundle multiple roles into reusable profiles and assign them to users at once.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />New Profile
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : profiles.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-14 text-center">
          <Layers className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No role profiles yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a profile to bundle roles like "Sales Team" or "Reviewer"
          </p>
          <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Create first profile
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">{profile.name}</CardTitle>
                    {profile.description && (
                      <CardDescription className="text-xs mt-0.5 line-clamp-2">
                        {profile.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditTarget(profile)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMut.mutate(profile.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3">
                  {profile.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No roles assigned</span>
                  ) : (
                    profile.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-xs">
                        {r}
                      </Badge>
                    ))
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs gap-1.5"
                  onClick={() => setAssignTarget(profile)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Apply to User
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <ProfileDialog
          open
          onClose={() => setCreateOpen(false)}
          title="New Role Profile"
          initial={EMPTY}
          onSave={(data) => createMut.mutate(data)}
          isPending={createMut.isPending}
          allRoles={roles}
        />
      )}

      {editTarget && (
        <ProfileDialog
          open
          onClose={() => setEditTarget(null)}
          title="Edit Role Profile"
          initial={{ name: editTarget.name, description: editTarget.description, roles: editTarget.roles }}
          onSave={(data) => updateMut.mutate({ id: editTarget.id, ...data })}
          isPending={updateMut.isPending}
          allRoles={roles}
        />
      )}

      {assignTarget && (
        <AssignDialog
          open
          onClose={() => setAssignTarget(null)}
          profile={assignTarget}
          allUsers={users}
          onAssign={(userId) => assignMut.mutate({ profileId: assignTarget.id, userId })}
          isPending={assignMut.isPending}
        />
      )}
    </div>
  );
}
