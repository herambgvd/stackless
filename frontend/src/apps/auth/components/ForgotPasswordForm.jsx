import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Zap, Loader2, Mail } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useForgotPassword } from "../hooks/useAuth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const mutation = useForgotPassword();

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(email, { onSuccess: () => setSent(true) });
  };

  if (sent) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Mail className="h-5 w-5" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            If <strong>{email}</strong> is registered, you&apos;ll receive a reset link shortly.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link to="/login" className="text-sm font-medium text-primary hover:underline">
            ← Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={!email || mutation.isPending}>
            {mutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
              : "Send reset link"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          ← Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
