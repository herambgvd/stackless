import { createFileRoute } from "@tanstack/react-router";
import { AuditLogPage } from "@/apps/admin/components/AuditLogPage";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  component: AuditLogPage,
});
