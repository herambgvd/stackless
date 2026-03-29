import { createFileRoute } from "@tanstack/react-router";
import ReportsListPage from "@/apps/reports/components/ReportsListPage";

export const Route = createFileRoute("/_authenticated/apps/$appId/reports")({
  component: ReportsListPage,
});
