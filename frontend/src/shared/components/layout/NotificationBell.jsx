import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck } from "lucide-react";
import { notificationsApi } from "@/apps/notifications/api/notifications.api";
import { apiClient } from "@/shared/lib/api-client";
import { fmtSmart } from "@/shared/lib/date";
import { useAuthStore } from "@/shared/store/auth.store";

function getApiOrigin() {
  const apiUrl = import.meta.env.VITE_API_URL ?? "";
  if (apiUrl.startsWith("http")) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      return window.location.origin;
    }
  }
  return window.location.origin;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const esRef = useRef(null);

  // SSE — subscribe to real-time notifications
  useEffect(() => {
    if (!isAuthenticated) return;

    let stopped = false;
    let retryTimer = null;

    async function connect() {
      if (stopped) return;

      // Always read the latest token from the store — never use a stale closure value.
      // If the access token is expired the apiClient interceptor will silently refresh
      // it using the refresh token before we open the new EventSource connection.
      try {
        await apiClient.get("/auth/me"); // triggers silent token refresh if needed
      } catch {
        // /auth/me failed and interceptor couldn't refresh → user logged out already
        return;
      }

      if (stopped) return;

      const { tokens: t } = useAuthStore.getState();
      if (!t?.access_token) return;

      const url = `${getApiOrigin()}/api/v1/notifications/stream?token=${encodeURIComponent(t.access_token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("notification", () => {
        qc.invalidateQueries({ queryKey: ["notifications", "inbox"] });
      });

      es.addEventListener("error", () => {
        es.close();
        if (!stopped) {
          retryTimer = setTimeout(connect, 5_000);
        }
      });
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      esRef.current?.close();
    };
  }, [isAuthenticated, qc]);

  const { data: inbox = [] } = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: () => notificationsApi.getInbox(),
    enabled: isAuthenticated,
    // Keep a fallback 60s poll in case SSE disconnects silently
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "inbox"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = inbox.filter((n) => !n.is_read);
      await Promise.all(unread.map((n) => notificationsApi.markRead(n.id)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "inbox"] }),
  });

  const unreadCount = inbox.filter((n) => !n.is_read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown panel */}
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <p className="text-sm font-semibold">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                    ({unreadCount} unread)
                  </span>
                )}
              </p>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {inbox.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                inbox.map((n) => {
                  const { label, title } = fmtSmart(n.created_at);
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                        n.is_read ? "bg-background" : "bg-primary/5"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        {n.subject && (
                          <p className={`text-sm font-medium truncate ${n.is_read ? "text-foreground" : "text-foreground"}`}>
                            {n.subject}
                          </p>
                        )}
                        {n.body && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {n.body}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-1" title={title}>
                          {label}
                        </p>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
