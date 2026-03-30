/**
 * useRealtimeUpdates
 *
 * Connects to the Stackless WebSocket endpoint for the current tenant and
 * invalidates TanStack Query caches when `doc_changed` events are received.
 *
 * The hook is designed to run once in the authenticated layout so all pages
 * benefit from live data without needing to know about WebSockets.
 */
import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/shared/store/auth.store";

const RECONNECT_DELAY_BASE_MS = 3_000;
const RECONNECT_DELAY_MAX_MS  = 30_000;
const PING_INTERVAL_MS        = 25_000;

function getWsUrl(tenantId) {
  const apiUrl = import.meta.env.VITE_API_URL ?? "";
  let host;
  if (apiUrl.startsWith("http")) {
    const url = new URL(apiUrl);
    host = url.host;
  } else {
    host = window.location.host;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${host}/ws/${tenantId}`;
}

export function useRealtimeUpdates() {
  const qc = useQueryClient();
  const { user, tokens } = useAuthStore();
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const activeRef = useRef(true);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_BASE_MS);

  const handleMessage = useCallback(
    (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "doc_changed": {
          const { app_id, model_slug, record_id, action } = msg;

          // Invalidate the list so any open RecordsPage refreshes
          qc.invalidateQueries({ queryKey: ["apps", app_id, "records", model_slug] });

          // Invalidate single-record caches (detail page / related docs)
          if (record_id && action !== "create") {
            qc.invalidateQueries({ queryKey: ["apps", app_id, "record", model_slug, record_id] });
            qc.invalidateQueries({ queryKey: ["related-docs", app_id, model_slug, record_id] });
            qc.invalidateQueries({ queryKey: ["record-audit", app_id, model_slug, record_id] });
            qc.invalidateQueries({ queryKey: ["activity", record_id] });
          }

          // Invalidate dashboard data for the app
          qc.invalidateQueries({ queryKey: ["app-dashboard", app_id, "data"] });

          // Invalidate kanban-style record queries
          qc.invalidateQueries({ queryKey: ["records", app_id, model_slug] });
          break;
        }

        case "workflow_update":
          // Invalidate workflow runs list and the specific run
          qc.invalidateQueries({ queryKey: ["workflow-runs"] });
          qc.invalidateQueries({ queryKey: ["workflow-run", msg.run_id] });
          break;

        case "approval_update":
          // Invalidate approval inbox and the specific request
          qc.invalidateQueries({ queryKey: ["approvals", "inbox"] });
          qc.invalidateQueries({ queryKey: ["approval-request", msg.request_id] });
          qc.invalidateQueries({ queryKey: ["approvals", "requests"] });
          break;

        case "comment_added":
          // Invalidate comments and activity feed for this record
          qc.invalidateQueries({
            queryKey: ["comments", msg.app_id, msg.model_slug, msg.record_id],
          });
          qc.invalidateQueries({
            queryKey: ["activity", msg.record_id],
          });
          break;

        case "task_assigned":
          // Invalidate tasks lists so the assignee's inbox refreshes
          qc.invalidateQueries({ queryKey: ["human-tasks"] });
          qc.invalidateQueries({ queryKey: ["my-tasks"] });
          break;

        case "notification":
          // Invalidate notifications inbox and unread badge count
          qc.invalidateQueries({ queryKey: ["notifications", "inbox"] });
          qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
          break;

        default:
          // Unknown event type — ignore silently
          break;
      }
    },
    [qc]
  );

  const connect = useCallback(() => {
    const tenantId = user?.tenant_id;
    const token = tokens?.access_token;
    if (!tenantId || !token || !activeRef.current) return;

    try {
      const url = `${getWsUrl(tenantId)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Reset backoff delay on successful connection
        reconnectDelayRef.current = RECONNECT_DELAY_BASE_MS;
        // Start periodic ping to keep the connection alive
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = handleMessage;

      ws.onclose = (closeEvent) => {
        clearInterval(pingTimerRef.current);
        if (activeRef.current) {
          // Exponential backoff: double the delay each attempt, capped at max
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_DELAY_MAX_MS);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Silently fail (e.g. browser blocks WebSocket in some envs)
    }
  }, [user?.tenant_id, tokens?.access_token, handleMessage]);

  useEffect(() => {
    // Only connect for tenant users (not super-admins without a tenant)
    if (!user?.tenant_id || !tokens?.access_token) return;

    activeRef.current = true;
    connect();

    return () => {
      activeRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      clearInterval(pingTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.tenant_id, tokens?.access_token, connect]);
}
