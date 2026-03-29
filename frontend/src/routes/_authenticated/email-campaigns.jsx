import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { EmailCampaignsPage } from "@/apps/email_campaigns/EmailCampaignsPage";

function builderGuard() {
  const { user } = useAuthStore.getState();
  const isBuilder =
    user?.is_superuser ||
    user?.roles?.includes("admin") ||
    user?.roles?.includes("Builder") ||
    user?.roles?.includes("builder");
  if (!isBuilder) throw redirect({ to: "/dashboard" });
}

export const Route = createFileRoute("/_authenticated/email-campaigns")({
  beforeLoad: builderGuard,
  component: EmailCampaignsPage,
});
