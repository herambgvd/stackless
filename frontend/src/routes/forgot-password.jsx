import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordForm } from "@/apps/auth/components/ForgotPasswordForm";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <ForgotPasswordForm />
    </div>
  );
}
