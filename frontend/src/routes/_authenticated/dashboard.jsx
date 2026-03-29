import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/apps/dashboard/components/DashboardPage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});
