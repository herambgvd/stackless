import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { LandingPage } from "@/apps/landing/LandingPage";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const { user, isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      if (user?.is_superuser) throw redirect({ to: "/admin/tenants" });
      throw redirect({ to: "/dashboard" });
    }
    // Not authenticated → show landing page
  },
  component: LandingPage,
});
