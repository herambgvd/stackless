import { createFileRoute } from "@tanstack/react-router";
import { JobsPage } from "@/apps/admin/components/JobsPage";

export const Route = createFileRoute("/_authenticated/admin/jobs")({
  component: JobsPage,
});
