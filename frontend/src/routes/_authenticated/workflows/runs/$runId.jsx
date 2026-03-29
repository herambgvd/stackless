import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { WorkflowRunDetailPage } from "@/apps/flow-designer/components/WorkflowRunDetailPage";

function builderGuard() {
  const { user } = useAuthStore.getState();
  const isBuilder =
    user?.is_superuser ||
    user?.roles?.includes("admin") ||
    user?.roles?.includes("builder");
  if (!isBuilder) throw redirect({ to: "/dashboard" });
}

export const Route = createFileRoute("/_authenticated/workflows/runs/$runId")({
  beforeLoad: builderGuard,
  component: WorkflowRunDetailPage,
});
