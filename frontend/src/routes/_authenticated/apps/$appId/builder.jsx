import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { AppBuilderPage } from "@/apps/app-builder/components/AppBuilderPage";

export const Route = createFileRoute("/_authenticated/apps/$appId/builder")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    const isBuilder =
      user?.is_superuser ||
      user?.roles?.includes("admin") ||
      user?.roles?.includes("builder");
    if (!isBuilder) throw redirect({ to: "/dashboard" });
  },
  component: AppBuilderPage,
});
