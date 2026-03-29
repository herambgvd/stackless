import { apiClient } from "@/shared/lib/api-client";

export const reportsApi = {
  list: (appId) =>
    apiClient.get(`/schema/apps/${appId}/saved-reports`).then((r) => r.data),
  create: (appId, data) =>
    apiClient.post(`/schema/apps/${appId}/saved-reports`, data).then((r) => r.data),
  get: (appId, reportId) =>
    apiClient.get(`/schema/apps/${appId}/saved-reports/${reportId}`).then((r) => r.data),
  update: (appId, reportId, data) =>
    apiClient.put(`/schema/apps/${appId}/saved-reports/${reportId}`, data).then((r) => r.data),
  delete: (appId, reportId) =>
    apiClient.delete(`/schema/apps/${appId}/saved-reports/${reportId}`).then((r) => r.data),
  run: (appId, reportId) =>
    apiClient.post(`/schema/apps/${appId}/saved-reports/${reportId}/run`).then((r) => r.data),
};
