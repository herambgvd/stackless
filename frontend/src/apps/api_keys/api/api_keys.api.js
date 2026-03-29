import { apiClient } from '@/shared/lib/api-client';

export const apiKeysApi = {
  list: async () => {
    const res = await apiClient.get('/api-keys');
    return res.data;
  },
  create: async (payload) => {
    const res = await apiClient.post('/api-keys', payload);
    return res.data;
  },
  revoke: async (keyId) => {
    await apiClient.delete(`/api-keys/${keyId}`);
  },
  toggle: async (keyId) => {
    const res = await apiClient.patch(`/api-keys/${keyId}/toggle`);
    return res.data;
  },
  update: async (keyId, payload) => {
    const res = await apiClient.patch(`/api-keys/${keyId}`, payload);
    return res.data;
  },
};
