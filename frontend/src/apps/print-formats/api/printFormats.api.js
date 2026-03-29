import { apiClient } from "@/shared/lib/api-client";

const base = (appId, modelSlug) => `/schema/apps/${appId}/${modelSlug}/print-formats`;
const lhBase = () => `/schema/letter-heads`;

export const printFormatsApi = {
  // Print Formats
  list: (appId, modelSlug) => apiClient.get(base(appId, modelSlug)).then((r) => r.data),
  create: (appId, modelSlug, data) => apiClient.post(base(appId, modelSlug), data).then((r) => r.data),
  update: (appId, modelSlug, id, data) => apiClient.put(`${base(appId, modelSlug)}/${id}`, data).then((r) => r.data),
  delete: (appId, modelSlug, id) => apiClient.delete(`${base(appId, modelSlug)}/${id}`).then((r) => r.data),

  // Letter Heads
  listLetterHeads: () => apiClient.get(lhBase()).then((r) => r.data),
  createLetterHead: (data) => apiClient.post(lhBase(), data).then((r) => r.data),
  updateLetterHead: (id, data) => apiClient.put(`${lhBase()}/${id}`, data).then((r) => r.data),
  deleteLetterHead: (id) => apiClient.delete(`${lhBase()}/${id}`).then((r) => r.data),
};
