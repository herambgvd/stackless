import { createFileRoute } from "@tanstack/react-router";
import { PropertySetterPage } from "@/apps/admin/components/PropertySetterPage";

export const Route = createFileRoute("/_authenticated/admin/property-setter")({
  component: PropertySetterPage,
});
