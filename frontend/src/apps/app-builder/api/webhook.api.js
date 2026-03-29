import { apiClient } from "@/shared/lib/api-client";

export const webhookApi = {
  list: async () => {
    const res = await apiClient.get("/webhooks/inbound");
    return res.data;
  },

  create: async (data) => {
    const res = await apiClient.post("/webhooks/inbound", data);
    return res.data;
  },

  delete: async (hookId) => {
    await apiClient.delete(`/webhooks/inbound/${hookId}`);
  },

  update: async (hookId, data) => {
    const res = await apiClient.patch(`/webhooks/inbound/${hookId}`, data);
    return res.data;
  },

  toggle: async (hookId) => {
    const res = await apiClient.patch(`/webhooks/inbound/${hookId}/toggle`);
    return res.data;
  },
};
