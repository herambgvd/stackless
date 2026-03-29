import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { UsageDashboard } from "@/apps/admin/UsageDashboard";

export const Route = createFileRoute("/_authenticated/admin/usage")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user?.is_superuser) throw redirect({ to: "/dashboard" });
  },
  component: UsageDashboard,
});
