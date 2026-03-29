import { createFileRoute } from "@tanstack/react-router";
import { AppDetailPage } from "@/apps/app-builder/components/AppDetailPage";

export const Route = createFileRoute("/_authenticated/apps/$appId/")({
  component: AppDetailPage,
});
