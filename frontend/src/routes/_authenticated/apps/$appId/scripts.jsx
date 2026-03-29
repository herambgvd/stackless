import { createFileRoute } from "@tanstack/react-router";
import ScriptsPage from "@/apps/scripts/components/ScriptsPage";

export const Route = createFileRoute("/_authenticated/apps/$appId/scripts")({
  component: ScriptsPage,
});
