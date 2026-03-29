import { createFileRoute } from "@tanstack/react-router";
import { SystemConsolePage } from "@/apps/admin/components/SystemConsolePage";

export const Route = createFileRoute("/_authenticated/admin/console")({
  component: SystemConsolePage,
});
