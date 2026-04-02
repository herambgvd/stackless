import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/apps/app-builder/components/RecordsPage";

export const Route = createFileRoute("/_authenticated/apps/$appId/records")({
  component: RecordsPage,
  validateSearch: (search) => ({
    model: search.model || undefined,
  }),
});
