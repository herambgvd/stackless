import { createFileRoute } from "@tanstack/react-router";
import { TenantConfigPage } from "@/apps/settings/components/TenantConfigPage";

export const Route = createFileRoute("/_authenticated/settings/tenant-config")({
  component: TenantConfigPage,
});
