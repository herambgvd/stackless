import { createFileRoute } from "@tanstack/react-router";
import { EmailInboxPage } from "@/apps/email_inbox/EmailInboxPage";

export const Route = createFileRoute("/_authenticated/email-inbox")({
  component: EmailInboxPage,
});
