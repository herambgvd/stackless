import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { RbacPage } from "@/apps/admin/rbac/components/RbacPage";

export const Route = createFileRoute("/_authenticated/admin/rbac")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user?.is_superuser && !user?.roles?.includes("admin"))
      throw redirect({ to: "/dashboard" });
  },
  component: RbacPage,
});
