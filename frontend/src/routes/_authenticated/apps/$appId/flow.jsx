import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { lazy, Suspense } from "react";

const FlowDesignerPage = lazy(() =>
  import("@/apps/flow-designer/components/FlowDesignerPage").then((m) => ({
    default: m.FlowDesignerPage,
  })),
);

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
  component: () => (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <FlowDesignerPage />
    </Suspense>
  ),
});
