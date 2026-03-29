import { apiClient } from "@/shared/lib/api-client";

export const notificationsApi = {
  listTemplates: async () => {
    const res = await apiClient.get("/notifications/templates");
    return res.data;
  },

  getTemplate: async (templateId) => {
    const res = await apiClient.get(`/notifications/templates/${templateId}`);
    return res.data;
  },

  createTemplate: async (data) => {
    const res = await apiClient.post("/notifications/templates", data);
    return res.data;
  },

  updateTemplate: async (templateId, data) => {
    const res = await apiClient.put(
      `/notifications/templates/${templateId}`,
      data,
    );
    return res.data;
  },

  deleteTemplate: async (templateId) => {
    await apiClient.delete(`/notifications/templates/${templateId}`);
  },

  send: async (data) => {
    const res = await apiClient.post("/notifications/send", data);
    return res.data;
  },

  listLogs: async (params = {}) => {
    const res = await apiClient.get("/notifications/logs", { params });
    return res.data;
  },

  getInbox: async ({ unreadOnly = false } = {}) => {
    const res = await apiClient.get("/notifications/inbox", {
      params: unreadOnly ? { unread_only: true } : {},
    });
    return res.data;
  },

  markRead: async (logId) => {
    const res = await apiClient.patch(`/notifications/inbox/${logId}/read`);
    return res.data;
  },
};
