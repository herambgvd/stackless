import { apiClient } from '@/shared/lib/api-client';

export const humanTasksApi = {
  list: async (statusFilter = null) => {
    const res = await apiClient.get('/human-tasks', {
      params: statusFilter ? { status_filter: statusFilter } : {},
    });
    return res.data;
  },

  get: async (taskId) => {
    const res = await apiClient.get(`/human-tasks/${taskId}`);
    return res.data;
  },

  complete: async (taskId, data) => {
    const res = await apiClient.post(`/human-tasks/${taskId}/complete`, { data });
    return res.data;
  },

  cancel: async (taskId) => {
    await apiClient.post(`/human-tasks/${taskId}/cancel`);
  },

  reassign: async (taskId, assigneeId) => {
    const res = await apiClient.patch(`/human-tasks/${taskId}/reassign`, { assignee_id: assigneeId });
    return res.data;
  },
};
