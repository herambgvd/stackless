import { apiClient } from "@/shared/lib/api-client";

export const rulesApi = {
  listRulesets: async (modelId) => {
    const res = await apiClient.get(`/rules/models/${modelId}/rulesets`);
    return res.data;
  },

  getRuleset: async (rulesetId) => {
    const res = await apiClient.get(`/rules/rulesets/${rulesetId}`);
    return res.data;
  },

  createRuleset: async (modelId, data) => {
    const res = await apiClient.post(`/rules/models/${modelId}/rulesets`, data);
    return res.data;
  },

  updateRuleset: async (rulesetId, data) => {
    const res = await apiClient.put(`/rules/rulesets/${rulesetId}`, data);
    return res.data;
  },

  deleteRuleset: async (rulesetId) => {
    await apiClient.delete(`/rules/rulesets/${rulesetId}`);
  },

  evaluate: async (data) => {
    const res = await apiClient.post("/rules/evaluate", data);
    return res.data;
  },
};
