import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const RecordsPage = lazy(() =>
  import("@/apps/app-builder/components/RecordsPage").then((m) => ({
    default: m.RecordsPage,
  })),
);

export const Route = createFileRoute("/_authenticated/apps/$appId/records")({
  component: () => (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <RecordsPage />
    </Suspense>
  ),
  validateSearch: (search) => ({
    model: search.model || undefined,
  }),
});
