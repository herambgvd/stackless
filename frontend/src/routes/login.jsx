import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginForm } from "@/apps/auth/components/LoginForm";
import { useAuthStore } from "@/shared/store/auth.store";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  return <LoginForm />;
}
