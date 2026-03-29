import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { WorkflowRunsPage } from "@/apps/flow-designer/components/WorkflowRunsPage";

function builderGuard() {
  const { user } = useAuthStore.getState();
  const isBuilder =
    user?.is_superuser ||
    user?.roles?.includes("admin") ||
    user?.roles?.includes("builder");
  if (!isBuilder) throw redirect({ to: "/dashboard" });
}

export const Route = createFileRoute("/_authenticated/workflows/runs/")({
  beforeLoad: builderGuard,
  component: WorkflowRunsPage,
});
