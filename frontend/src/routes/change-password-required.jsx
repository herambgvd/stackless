import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { ForceChangePasswordForm } from "@/apps/auth/components/ForceChangePasswordForm";

export const Route = createFileRoute("/change-password-required")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) throw redirect({ to: "/" });
  },
  component: ChangePasswordRequiredPage,
});

function ChangePasswordRequiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <ForceChangePasswordForm />
    </div>
  );
}
