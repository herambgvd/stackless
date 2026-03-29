import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useResetPassword } from "../hooks/useAuth";

export function ResetPasswordForm() {
  const { token } = useSearch({ strict: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const mutation = useResetPassword();

  const mismatch = confirm && password !== confirm;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirm) return;
    mutation.mutate({ token, new_password: password });
  };

  if (!token) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle>Invalid Link</CardTitle>
          <CardDescription>This password reset link is invalid or has expired.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-5 w-5" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Set new password</CardTitle>
        <CardDescription>Choose a strong password (at least 8 characters).</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={mismatch ? "border-destructive" : ""}
            />
            {mismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!password || !confirm || mismatch || password.length < 8 || mutation.isPending}
          >
            {mutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting…</>
              : "Reset password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
