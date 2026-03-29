import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { TenantsPage } from "@/apps/admin/tenants/components/TenantsPage";

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user?.is_superuser) throw redirect({ to: "/dashboard" });
  },
  component: TenantsPage,
});
