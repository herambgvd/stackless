import { createFileRoute } from "@tanstack/react-router";
import { ErrorLogsPage } from "@/apps/admin/components/ErrorLogsPage";

export const Route = createFileRoute("/_authenticated/admin/error-logs")({
  component: ErrorLogsPage,
});
