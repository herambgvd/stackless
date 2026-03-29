import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordForm } from "@/apps/auth/components/ResetPasswordForm";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search) => ({ token: search.token ?? "" }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <ResetPasswordForm />
    </div>
  );
}
