import { apiClient } from "@/shared/lib/api-client";

export const portalFormsApi = {
  list: async (appId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/portal-forms`);
    return res.data;
  },
  create: async (appId, payload) => {
    const res = await apiClient.post(
      `/schema/apps/${appId}/portal-forms`,
      payload,
    );
    return res.data;
  },
  update: async (appId, formId, payload) => {
    const res = await apiClient.put(
      `/schema/apps/${appId}/portal-forms/${formId}`,
      payload,
    );
    return res.data;
  },
  delete: async (appId, formId) => {
    await apiClient.delete(`/schema/apps/${appId}/portal-forms/${formId}`);
  },
};
