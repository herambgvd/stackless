import { apiClient } from "@/shared/lib/api-client";

export const workflowApi = {
  listWorkflows: async (appId) => {
    const params = appId ? { app_id: appId } : {};
    const res = await apiClient.get("/workflows", { params });
    return res.data;
  },

  getWorkflow: async (workflowId) => {
    const res = await apiClient.get(`/workflows/${workflowId}`);
    return res.data;
  },

  createWorkflow: async (data) => {
    const res = await apiClient.post("/workflows", data);
    return res.data;
  },

  updateWorkflow: async (workflowId, data) => {
    const res = await apiClient.put(`/workflows/${workflowId}`, data);
    return res.data;
  },

  deleteWorkflow: async (workflowId) => {
    await apiClient.delete(`/workflows/${workflowId}`);
  },

  triggerWorkflow: async (workflowId, payload = {}) => {
    const res = await apiClient.post(
      `/workflows/${workflowId}/trigger`,
      payload,
    );
    return res.data;
  },

  listRuns: async (workflowId) => {
    const params = workflowId ? { workflow_id: workflowId } : {};
    const res = await apiClient.get("/workflows/runs", { params });
    return res.data;
  },

  getRun: async (runId) => {
    const res = await apiClient.get(`/workflows/runs/${runId}`);
    return res.data;
  },

  cancelRun: async (runId) => {
    const res = await apiClient.post(`/workflows/runs/${runId}/cancel`);
    return res.data;
  },
};
