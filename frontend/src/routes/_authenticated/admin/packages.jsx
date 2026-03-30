import { createFileRoute } from "@tanstack/react-router";
import { PackagesPage } from "@/apps/admin/packages/components/PackagesPage";

export const Route = createFileRoute("/_authenticated/admin/packages")({
  component: PackagesPage,
});
