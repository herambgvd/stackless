import { apiClient } from "@/shared/lib/api-client";

export const reportsApi = {
  list: async (appId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/reports`);
    return res.data;
  },
  create: async (appId, payload) => {
    const res = await apiClient.post(`/schema/apps/${appId}/reports`, payload);
    return res.data;
  },
  update: async (appId, reportId, payload) => {
    const res = await apiClient.put(
      `/schema/apps/${appId}/reports/${reportId}`,
      payload,
    );
    return res.data;
  },
  delete: async (appId, reportId) => {
    await apiClient.delete(`/schema/apps/${appId}/reports/${reportId}`);
  },
  sendNow: async (appId, reportId) => {
    const res = await apiClient.post(
      `/schema/apps/${appId}/reports/${reportId}/send-now`,
    );
    return res.data;
  },
};
