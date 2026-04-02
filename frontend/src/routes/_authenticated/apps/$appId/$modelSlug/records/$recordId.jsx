import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const RecordDetailPage = lazy(() =>
  import("@/apps/app-builder/components/RecordDetailPage").then((m) => ({
    default: m.RecordDetailPage,
  })),
);

export const Route = createFileRoute(
  "/_authenticated/apps/$appId/$modelSlug/records/$recordId",
)({
  component: () => (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <RecordDetailPage />
    </Suspense>
  ),
});
