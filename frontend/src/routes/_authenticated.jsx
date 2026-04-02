import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/shared/store/auth.store";
import { apiClient } from "@/shared/lib/api-client";
import { useRealtimeUpdates } from "@/shared/hooks/useRealtimeUpdates";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) throw redirect({ to: "/" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const setUser = useAuthStore((s) => s.setUser);
  const setCsrfToken = useAuthStore((s) => s.setCsrfToken);

  useEffect(() => {
    // Refresh user data (roles, is_superuser, etc.) from server on mount
    apiClient
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {});
    // Fetch CSRF token on page load (not persisted across refreshes)
    apiClient
      .get("/auth/csrf-token")
      .then((res) => setCsrfToken(res.data.csrf_token))
      .catch(() => {});
  }, [setUser, setCsrfToken]);

  // Connect to WebSocket for live record / dashboard updates
  useRealtimeUpdates();

  return <Outlet />;
}
