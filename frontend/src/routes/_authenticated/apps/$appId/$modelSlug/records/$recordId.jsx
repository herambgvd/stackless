import { createFileRoute } from "@tanstack/react-router";
import { RecordDetailPage } from "@/apps/app-builder/components/RecordDetailPage";

export const Route = createFileRoute(
  "/_authenticated/apps/$appId/$modelSlug/records/$recordId",
)({
  component: RecordDetailPage,
});
