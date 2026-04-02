import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, Component } from "react";
import { useAuthStore } from "@/shared/store/auth.store";
import { apiClient } from "@/shared/lib/api-client";
import { useRealtimeUpdates } from "@/shared/hooks/useRealtimeUpdates";
import { Button } from "@/shared/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) throw redirect({ to: "/" });
  },
  component: AuthenticatedLayout,
  errorComponent: RouteErrorFallback,
});

function RouteErrorFallback({ error }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {error?.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
          <Button onClick={() => window.location.href = "/dashboard"}>
            Go to Dashboard
          </Button>
        </div>
      </div>
      {import.meta.env.DEV && error?.stack && (
        <pre className="mt-4 p-4 bg-muted rounded text-xs max-w-2xl overflow-auto max-h-48">
          {error.stack}
        </pre>
      )}
    </div>
  );
}

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
