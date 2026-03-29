import { apiClient } from "@/shared/lib/api-client";

const base = (appId) => `/schema/apps/${appId}`;

export const scriptsApi = {
  // Server Scripts
  listServerScripts: (appId) => apiClient.get(`${base(appId)}/server-scripts`).then(r => r.data),
  createServerScript: (appId, data) => apiClient.post(`${base(appId)}/server-scripts`, data).then(r => r.data),
  updateServerScript: (appId, id, data) => apiClient.put(`${base(appId)}/server-scripts/${id}`, data).then(r => r.data),
  deleteServerScript: (appId, id) => apiClient.delete(`${base(appId)}/server-scripts/${id}`).then(r => r.data),
  testServerScript: (appId, id, doc) => apiClient.post(`${base(appId)}/server-scripts/${id}/test`, { doc }).then(r => r.data),

  // Client Scripts
  listClientScripts: (appId) => apiClient.get(`${base(appId)}/client-scripts`).then(r => r.data),
  createClientScript: (appId, data) => apiClient.post(`${base(appId)}/client-scripts`, data).then(r => r.data),
  updateClientScript: (appId, id, data) => apiClient.put(`${base(appId)}/client-scripts/${id}`, data).then(r => r.data),
  deleteClientScript: (appId, id) => apiClient.delete(`${base(appId)}/client-scripts/${id}`).then(r => r.data),
};
