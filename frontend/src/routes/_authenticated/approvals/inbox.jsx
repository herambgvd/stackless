import { createFileRoute } from "@tanstack/react-router";
import { ApprovalInboxPage } from "@/apps/approvals/components/ApprovalInboxPage";

export const Route = createFileRoute("/_authenticated/approvals/inbox")({
  component: ApprovalInboxPage,
});
