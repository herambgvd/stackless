import { apiClient } from '@/shared/lib/api-client';

export const workflowTemplatesApi = {
  list: async (category = null) => {
    const res = await apiClient.get('/schema/workflow-templates', {
      params: category ? { category } : {},
    });
    return res.data;
  },
  get: async (templateId) => {
    const res = await apiClient.get(`/schema/workflow-templates/${templateId}`);
    return res.data;
  },
  install: async (templateId, { appId = null, modelId = null } = {}) => {
    const params = {};
    if (appId) params.app_id = appId;
    if (modelId) params.model_id = modelId;
    const res = await apiClient.post(
      `/schema/workflow-templates/${templateId}/install`,
      null,
      { params }
    );
    return res.data;
  },
};
