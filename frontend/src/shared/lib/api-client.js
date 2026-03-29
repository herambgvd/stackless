import axios from "axios";
import { useAuthStore } from "@/shared/store/auth.store";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

const SAFE_METHODS = new Set(["get", "head", "options"]);

// ── Request: attach access token + tenant header + CSRF token ─────────────────
apiClient.interceptors.request.use((config) => {
  const { tokens, user, csrfToken } = useAuthStore.getState();
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`;
  }
  if (user?.tenant_id) {
    config.headers["X-Tenant-ID"] = user.tenant_id;
  }
  // Attach CSRF token on all state-mutating requests
  const method = (config.method ?? "get").toLowerCase();
  if (!SAFE_METHODS.has(method) && csrfToken) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

// ── Helper: fetch and store a fresh CSRF token ────────────────────────────────
async function refreshCsrfToken() {
  try {
    const { data } = await apiClient.get("/auth/csrf-token");
    useAuthStore.getState().setCsrfToken(data.csrf_token);
    return data.csrf_token;
  } catch {
    return null;
  }
}

// ── Response: silent refresh on 401 ──────────────────────────────────────────
let isRefreshing = false;
let pendingQueue = [];

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // CSRF token expired — fetch a fresh one and retry once
    if (error.response?.status === 403 && error.response?.data?.code === "CSRF_INVALID" && !original._csrfRetry) {
      original._csrfRetry = true;
      const newToken = await refreshCsrfToken();
      if (newToken) {
        original.headers["X-CSRF-Token"] = newToken;
        return apiClient(original);
      }
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: (token) => {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(original));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      const { tokens, setTokens, logout } = useAuthStore.getState();

      if (!tokens?.refresh_token) {
        logout();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: tokens.refresh_token,
        });
        setTokens(data);
        isRefreshing = false;
        // Refresh CSRF token after access token rotation (fire-and-forget)
        setTimeout(refreshCsrfToken, 0);
        pendingQueue.forEach(({ resolve }) => resolve(data.access_token));
        pendingQueue = [];
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return apiClient(original);
      } catch (refreshError) {
        // Clear all pending requests — they will all fail
        pendingQueue.forEach(({ reject }) => reject(refreshError));
        pendingQueue = [];
        isRefreshing = false;
        // Force logout and redirect to home
        const { logout } = useAuthStore.getState();
        logout();
        window.location.href = "/";
        return Promise.reject(refreshError);
      }
    }

    const message =
      error.response?.data?.detail ?? error.message ?? "An unexpected error occurred.";
    return Promise.reject(new Error(message));
  }
);
