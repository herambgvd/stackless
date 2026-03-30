import { createFileRoute } from "@tanstack/react-router";
import { BrandingPage } from "@/apps/settings/components/BrandingPage";

export const Route = createFileRoute("/_authenticated/settings/branding")({
  component: BrandingPage,
});
