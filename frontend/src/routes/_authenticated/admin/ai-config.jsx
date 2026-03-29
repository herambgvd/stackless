import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { AIConfigPage } from "@/apps/ai-builder/components/AIConfigPage";

export const Route = createFileRoute("/_authenticated/admin/ai-config")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user?.is_superuser) throw redirect({ to: "/dashboard" });
  },
  component: AIConfigPage,
});
