import { apiClient } from "@/shared/lib/api-client";

export const portalApi = {
  /** All models + their field schemas for an app (for sidebar navigation) */
  getAppModels: async (appId) => {
    const res = await apiClient.get(`/portal/apps/${appId}/models`);
    return res.data;
  },

  /** First model schema (backward compat) */
  getAppSchema: async (appId) => {
    const res = await apiClient.get(`/portal/apps/${appId}/schema`);
    return res.data;
  },

  /** Submit data to a specific model */
  submitForm: async (appId, data, modelSlug) => {
    const res = await apiClient.post(`/portal/apps/${appId}/submit`, {
      data,
      model_slug: modelSlug ?? null,
    });
    return res.data;
  },

  getSubmissions: async (appId, params = {}) => {
    const res = await apiClient.get(`/portal/apps/${appId}/submissions`, { params });
    return res.data;
  },

  listRecords: async (appId, modelSlug) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records`, {
      params: { page: 1, page_size: 200, sort_field: "created_at", sort_dir: -1 },
    });
    return res.data?.items ?? [];
  },

  uploadFile: async (appId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.post(`/portal/apps/${appId}/upload-file`, fd);
    return res.data;
  },
};
