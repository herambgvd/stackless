import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { FlowDesignerPage } from "@/apps/flow-designer/components/FlowDesignerPage";

function builderGuard() {
  const { user } = useAuthStore.getState();
  const isBuilder =
    user?.is_superuser ||
    user?.roles?.includes("admin") ||
    user?.roles?.includes("builder");
  if (!isBuilder) throw redirect({ to: "/dashboard" });
}

export const Route = createFileRoute("/_authenticated/apps/$appId/flow")({
  beforeLoad: builderGuard,
  component: FlowDesignerPage,
});
