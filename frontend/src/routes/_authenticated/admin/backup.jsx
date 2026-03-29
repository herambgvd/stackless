import { createFileRoute } from "@tanstack/react-router";
import { DatabaseBackupPage } from "@/apps/admin/components/DatabaseBackupPage";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  component: DatabaseBackupPage,
});
