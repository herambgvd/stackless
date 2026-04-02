import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { authApi } from "../api/auth.api";
import { useAuthStore } from "@/shared/store/auth.store";

export function ForceChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const mutation = useMutation({
    mutationFn: (data) => authApi.forceChangePassword(data),
    onSuccess: async () => {
      toast.success("Password changed successfully!");
      // Refresh user data so must_change_password is cleared
      try {
        const user = await authApi.getMe();
        setUser(user);
      } catch {}
      navigate({ to: "/dashboard" });
    },
    onError: (err) =>
      toast.error(err.response?.data?.detail || "Failed to change password"),
  });

  const mismatch = confirm && newPassword !== confirm;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newPassword !== confirm) return;
    mutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Change your password</CardTitle>
        <CardDescription>
          You must set a new password before continuing. Enter the temporary
          password you received in your invitation email, then choose a new
          password.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="current-password">Temporary password</Label>
            <Input
              id="current-password"
              type="password"
              placeholder="From your invitation email"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPw ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter new password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={mismatch ? "border-destructive" : ""}
            />
            {mismatch && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              !currentPassword ||
              !newPassword ||
              !confirm ||
              mismatch ||
              newPassword.length < 8 ||
              mutation.isPending
            }
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Set new password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
