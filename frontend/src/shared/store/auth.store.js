import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useAuthStore = create()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      csrfToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      setTokens: (tokens) => set({ tokens }),
      setCsrfToken: (csrfToken) => set({ csrfToken }),
      setAuth: (user, tokens) => set({ user, tokens, isAuthenticated: true }),
      logout: () => {
        // Clear tokens stored outside Zustand (used by WebSocket, api-client interceptors)
        localStorage.removeItem("access_token");
        localStorage.removeItem("tenant_id");
        set({ user: null, tokens: null, csrfToken: null, isAuthenticated: false });
      },
    }),
    {
      name: "stackless-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
        // Don't persist csrfToken — always fetch fresh on page load
      }),
    }
  )
);
