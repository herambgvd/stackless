import { apiClient } from '@/shared/lib/api-client';

export const appDashboardApi = {
  listWidgets: async (appId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/dashboard/widgets`);
    return res.data;
  },
  createWidget: async (appId, payload) => {
    const res = await apiClient.post(`/schema/apps/${appId}/dashboard/widgets`, payload);
    return res.data;
  },
  updateWidget: async (appId, widgetId, payload) => {
    const res = await apiClient.put(`/schema/apps/${appId}/dashboard/widgets/${widgetId}`, payload);
    return res.data;
  },
  deleteWidget: async (appId, widgetId) => {
    await apiClient.delete(`/schema/apps/${appId}/dashboard/widgets/${widgetId}`);
  },
  getDashboardData: async (appId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/dashboard/data`);
    return res.data;
  },
};
