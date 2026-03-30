import { useState, useEffect } from "react";
import { Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { useAuthStore } from "@/shared/store/auth.store";
import { useOnlineStatus, usePWAInstall } from "@/shared/hooks/usePWA";
import { WifiOff, Download, X, LogOut } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

const AUTH_ROUTES = ["/login", "/register"];
// Routes that are public (no auth required, no redirect, no shell chrome)
const PUBLIC_ROUTES = ["/", "/onboarding"];

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const { isAuthenticated, logout } = useAuthStore();
  const isOnline = useOnlineStatus();
  const { canInstall, install } = usePWAInstall();
  const { location } = useRouterState();
  const navigate = useNavigate();
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);

  // Redirect to login immediately when auth is lost (logout, token expiry)
  // Skip for public routes (landing page, onboarding) — they handle their own auth
  useEffect(() => {
    if (!isAuthenticated && !isAuthRoute && !isPublicRoute) {
      navigate({ to: "/", replace: true });
    }
  }, [isAuthenticated, isAuthRoute, isPublicRoute, navigate]);

  // Render nothing while redirect is in-flight — prevents last page flash
  if (!isAuthenticated && !isAuthRoute && !isPublicRoute) {
    return null;
  }

  // Public routes (landing page, onboarding wizard) — render with no shell chrome
  if (isPublicRoute) {
    return <Outlet />;
  }

  if (!isAuthenticated || isAuthRoute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <Outlet />
      </div>
    );
  }

  const PAGE_TITLES = {
    "/dashboard": "Dashboard",
    "/apps": "My Apps",
    "/ai-builder": "AI Builder",
    "/approvals/inbox": "Approval Inbox",
    "/approvals/flows": "Approval Flows",
    "/workflows/runs": "Workflow Runs",
    "/rules": "Rules Engine",
    "/notifications": "Notifications",
    "/admin/users": "User Management",
    "/admin/rbac": "Roles & Permissions",
    "/admin/tenants": "Organizations",
    "/admin/ai-config": "AI Settings",
    "/scripts": "Scripts",
    "/print-formats": "Print Formats",
  };

  const pageTitle =
    PAGE_TITLES[location.pathname] ||
    location.pathname.split("/").filter(Boolean).at(-1)?.replace(/-/g, " ") ||
    "";


  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((p) => !p)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
          <h1 className="text-base font-semibold text-foreground capitalize">
            {pageTitle}
          </h1>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { logout(); navigate({ to: "/", replace: true }); }}
                    className="flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Logout</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        {/* ── Offline banner ── */}
        {!isOnline && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2 text-sm text-yellow-700">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>You're offline. Changes will sync when you reconnect.</span>
          </div>
        )}

        {/* ── PWA install banner ── */}
        {canInstall && !installDismissed && (
          <div className="flex items-center gap-3 bg-primary/5 border-b border-primary/10 px-6 py-2 text-sm">
            <Download className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-foreground">Install Stackless as an app for a better mobile experience.</span>
            <button
              onClick={install}
              className="text-primary font-medium hover:underline"
            >
              Install
            </button>
            <button
              onClick={() => setInstallDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ConfirmDialog />
    </div>
  );
}
