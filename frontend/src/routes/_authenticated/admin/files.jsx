import { createFileRoute } from "@tanstack/react-router";
import { FileManagerPage } from "@/apps/admin/components/FileManagerPage";

export const Route = createFileRoute("/_authenticated/admin/files")({
  component: FileManagerPage,
});
