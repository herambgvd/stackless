import { apiClient } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/store/auth.store";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

// ─── Config ───────────────────────────────────────────────────────────────────

export const aiApi = {
  getConfig: async () => {
    const res = await apiClient.get("/ai/config");
    return res.data;
  },

  saveConfig: async (data) => {
    const res = await apiClient.put("/ai/config", data);
    return res.data;
  },

  // ─── Sessions ──────────────────────────────────────────────────────────────

  listSessions: async () => {
    const res = await apiClient.get("/ai/sessions");
    return res.data;
  },

  getSession: async (sessionId) => {
    const res = await apiClient.get(`/ai/sessions/${sessionId}`);
    return res.data;
  },

  deleteSession: async (sessionId) => {
    await apiClient.delete(`/ai/sessions/${sessionId}`);
  },

  // ─── Generate ──────────────────────────────────────────────────────────────

  generateApp: async (sessionId) => {
    const res = await apiClient.post("/ai/generate", { session_id: sessionId });
    return res.data;
  },

  /**
   * Stream a chat message via SSE using fetch (EventSource can't send auth headers).
   *
   * @param {string} message
   * @param {string|null} sessionId
   * @param {{ onChunk: (text:string)=>void, onDone: (payload:object)=>void, onError: (msg:string)=>void }} callbacks
   * @returns {()=>void} cleanup function that aborts the stream
   */
  streamChat: (message, sessionId, { onChunk, onDone, onError }) => {
    const { tokens, user } = useAuthStore.getState();
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(tokens?.access_token ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
            ...(user?.tenant_id ? { "X-Tenant-ID": user.tenant_id } : {}),
          },
          body: JSON.stringify({ message, session_id: sessionId ?? null }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          onError(text || `HTTP ${res.status}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep incomplete last line

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "token") {
                onChunk(payload.content ?? "");
              } else if (payload.type === "done") {
                onDone(payload);
              } else if (payload.type === "error") {
                onError(payload.message ?? "Unknown error");
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          onError(err.message ?? "Stream error");
        }
      }
    })();

    return () => ctrl.abort();
  },
};
