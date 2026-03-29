import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useTenantStore = create()(
  persist(
    (set) => ({
      currentTenant: null,
      setTenant: (tenant) => set({ currentTenant: tenant }),
      clearTenant: () => set({ currentTenant: null }),
    }),
    {
      name: "flowforge-tenant",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
