import { apiClient } from "@/shared/lib/api-client";

export const templatesApi = {
  list: async (category = null) => {
    const params = category ? { category } : {};
    const res = await apiClient.get("/schema/templates", { params });
    return res.data;
  },
  get: async (templateId) => {
    const res = await apiClient.get(`/schema/templates/${templateId}`);
    return res.data;
  },
  instantiate: async (templateId) => {
    const res = await apiClient.post(
      `/schema/templates/${templateId}/instantiate`,
    );
    return res.data;
  },
};
