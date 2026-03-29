import { apiClient } from "@/shared/lib/api-client";

export const dashboardApi = {
  getStats: async () => {
    const res = await apiClient.get("/dashboard/stats");
    return res.data;
  },

  getRecentApps: async () => {
    const res = await apiClient.get("/schema/apps");
    return res.data;
  },

  getWorkspace: async () => {
    const res = await apiClient.get("/dashboard/workspace");
    return res.data;
  },
};
