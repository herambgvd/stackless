import { createFileRoute, redirect } from "@tanstack/react-router";
import { RegisterForm } from "@/apps/auth/components/RegisterForm";
import { useAuthStore } from "@/shared/store/auth.store";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) throw redirect({ to: "/dashboard" });
  },
  component: RegisterPage,
});

function RegisterPage() {
  return <RegisterForm />;
}
