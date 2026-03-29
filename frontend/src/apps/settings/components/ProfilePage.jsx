import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/store/auth.store";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/shared/components/ui/card";
import { Loader2, User, KeyRound, Bell } from "lucide-react";
import { toast } from "sonner";

const PREF_LABELS = {
  inapp_mentions: { label: "In-app: @mentions", desc: "Receive an in-app notification when someone mentions you in a comment" },
  inapp_assignments: { label: "In-app: Assignments", desc: "Receive an in-app notification when a record is assigned to you" },
  inapp_approvals: { label: "In-app: Approvals", desc: "Receive an in-app notification when an approval action is required" },
  email_mentions: { label: "Email: @mentions", desc: "Receive an email when someone mentions you in a comment" },
  email_assignments: { label: "Email: Assignments", desc: "Receive an email when a record is assigned to you" },
  email_approvals: { label: "Email: Approvals", desc: "Receive an email when an approval action is required" },
  email_digest: { label: "Email: Daily digest", desc: "Receive a daily summary of your pending tasks, approvals, and unread notifications" },
};

export function ProfilePage() {
  const qc = useQueryClient();
  const { user, setUser } = useAuthStore();

  // Profile form
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updateProfileMut = useMutation({
    mutationFn: () =>
      apiClient.put("/auth/me", { full_name: fullName.trim(), email: email.trim() }).then((r) => r.data),
    onSuccess: (updated) => {
      if (setUser) setUser(updated);
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const changePasswordMut = useMutation({
    mutationFn: () =>
      apiClient.post("/auth/me/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  // Notification preferences
  const { data: prefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => apiClient.get("/notifications/preferences").then((r) => r.data),
  });

  const updatePrefMut = useMutation({
    mutationFn: (update) =>
      apiClient.put("/notifications/preferences", update).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  });

  const initials = (user?.full_name || user?.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update your name, email address, and password.
        </p>
      </div>

      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-semibold">
          {initials}
        </div>
        <div>
          <p className="font-medium">{user?.full_name || "—"}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          {user?.roles?.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {user.roles.join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Profile details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Profile Details</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Update your display name and email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => updateProfileMut.mutate()}
              disabled={updateProfileMut.isPending || (!fullName.trim() && !email.trim())}
            >
              {updateProfileMut.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              Save profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Change Password</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Choose a strong password. You'll be asked to log in again after changing it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-pass">Current password</Label>
            <Input
              id="current-pass"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pass">New password</Label>
            <Input
              id="new-pass"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pass">Confirm new password</Label>
            <Input
              id="confirm-pass"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive mt-1">Passwords do not match.</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => changePasswordMut.mutate()}
              disabled={
                changePasswordMut.isPending ||
                !currentPassword ||
                newPassword.length < 8 ||
                newPassword !== confirmPassword
              }
            >
              {changePasswordMut.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              Change password
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Notification Preferences</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Choose how and when you receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(PREF_LABELS).map(([key, { label, desc }]) => (
            <div key={key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <div className="min-w-0 pr-4">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={prefs ? !!prefs[key] : false}
                disabled={!prefs || updatePrefMut.isPending}
                onCheckedChange={(checked) => updatePrefMut.mutate({ [key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
