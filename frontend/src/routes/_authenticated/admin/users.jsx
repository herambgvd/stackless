import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { UserManagementPage } from "@/apps/admin/users/components/UserManagementPage";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user?.is_superuser && !user?.roles?.includes("admin"))
      throw redirect({ to: "/dashboard" });
  },
  component: UserManagementPage,
});
