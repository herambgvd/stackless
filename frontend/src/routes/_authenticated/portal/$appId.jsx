import { createFileRoute } from "@tanstack/react-router";
import { PortalPage } from "@/apps/portal/components/PortalPage";

export const Route = createFileRoute("/_authenticated/portal/$appId")({
  component: PortalPage,
});
