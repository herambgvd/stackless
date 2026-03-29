import { createFileRoute } from "@tanstack/react-router";
import { RoleProfilesPage } from "@/apps/admin/rbac/components/RoleProfilesPage";

export const Route = createFileRoute("/_authenticated/admin/role-profiles")({
  component: RoleProfilesPage,
});
