import { apiClient } from "@/shared/lib/api-client";

export const tenantsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get("/tenants", { params });
    return res.data;
  },

  get: async (tenantId) => {
    const res = await apiClient.get(`/tenants/${tenantId}`);
    return res.data;
  },

  create: async (data) => {
    const res = await apiClient.post("/tenants", data);
    return res.data;
  },

  update: async (tenantId, data) => {
    const res = await apiClient.put(`/tenants/${tenantId}`, data);
    return res.data;
  },

  delete: async (tenantId) => {
    await apiClient.delete(`/tenants/${tenantId}`);
  },

  getStats: async (tenantId) => {
    const res = await apiClient.get(`/tenants/${tenantId}/stats`);
    return res.data;
  },
};
