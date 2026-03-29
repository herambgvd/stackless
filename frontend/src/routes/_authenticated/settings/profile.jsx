import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/apps/settings/components/ProfilePage";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfilePage,
});
