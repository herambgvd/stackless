import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/shared/store/auth.store";
import { OnboardingWizard } from "@/apps/onboarding/OnboardingWizard";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated) throw redirect({ to: "/login" });
    // If already completed onboarding, go to dashboard
    if (user?.onboarding_completed) throw redirect({ to: "/dashboard" });
  },
  component: OnboardingWizard,
});
