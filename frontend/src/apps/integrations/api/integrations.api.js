import { apiClient } from '@/shared/lib/api-client';

export const integrationsApi = {
  list: async () => {
    const res = await apiClient.get('/integrations');
    return res.data;
  },
  listProviders: async () => {
    const res = await apiClient.get('/integrations/providers');
    return res.data;
  },
  create: async (payload) => {
    const res = await apiClient.post('/integrations', payload);
    return res.data;
  },
  update: async (id, payload) => {
    const res = await apiClient.put(`/integrations/${id}`, payload);
    return res.data;
  },
  delete: async (id) => {
    await apiClient.delete(`/integrations/${id}`);
  },
  test: async (id) => {
    const res = await apiClient.post(`/integrations/${id}/test`);
    return res.data;
  },
};
