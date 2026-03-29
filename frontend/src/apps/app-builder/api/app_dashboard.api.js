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
  reorderWidgets: async (appId, widgetIds) => {
    const res = await apiClient.put(`/schema/apps/${appId}/dashboard/widgets-order`, widgetIds);
    return res.data;
  },
  getDashboardData: async (appId, { dateFrom, dateTo } = {}) => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await apiClient.get(`/schema/apps/${appId}/dashboard/data`, { params });
    return res.data;
  },
};
