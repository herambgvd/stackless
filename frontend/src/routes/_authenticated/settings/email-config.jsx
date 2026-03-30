import { createFileRoute } from "@tanstack/react-router";
import { EmailConfigPage } from "@/apps/settings/components/EmailConfigPage";

export const Route = createFileRoute("/_authenticated/settings/email-config")({
  component: EmailConfigPage,
});
