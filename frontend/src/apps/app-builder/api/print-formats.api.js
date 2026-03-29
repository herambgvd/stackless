import { apiClient } from "@/shared/lib/api-client";

const base = (appId, modelSlug) =>
  `/schema/apps/${appId}/${modelSlug}/print-formats`;

export const printFormatsApi = {
  list: async (appId, modelSlug) => {
    const res = await apiClient.get(base(appId, modelSlug));
    return res.data;
  },

  create: async (appId, modelSlug, data) => {
    const res = await apiClient.post(base(appId, modelSlug), data);
    return res.data;
  },

  update: async (appId, modelSlug, formatId, data) => {
    const res = await apiClient.put(`${base(appId, modelSlug)}/${formatId}`, data);
    return res.data;
  },

  delete: async (appId, modelSlug, formatId) => {
    await apiClient.delete(`${base(appId, modelSlug)}/${formatId}`);
  },

  renderUrl: (appId, modelSlug, recordId, formatId) =>
    `/api/v1/schema/apps/${appId}/${modelSlug}/records/${recordId}/print/${formatId}`,
};

// ── Letter Head API ──────────────────────────────────────────────────────────
export const letterHeadApi = {
  list: async () => {
    const res = await apiClient.get("/schema/letter-heads");
    return res.data;
  },
  create: async (data) => {
    const res = await apiClient.post("/schema/letter-heads", data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await apiClient.put(`/schema/letter-heads/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    await apiClient.delete(`/schema/letter-heads/${id}`);
  },
};
