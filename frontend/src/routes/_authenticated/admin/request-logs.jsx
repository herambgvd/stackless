import { createFileRoute } from "@tanstack/react-router";
import { RequestLogPage } from "@/apps/admin/components/RequestLogPage";

export const Route = createFileRoute("/_authenticated/admin/request-logs")({
  component: RequestLogPage,
});
