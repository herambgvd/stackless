import { apiClient } from "@/shared/lib/api-client";

export const approvalsApi = {
  // Returns { requests: [...], total: N }
  getInbox: async () => {
    const res = await apiClient.get("/approvals/inbox");
    return res.data;
  },

  getRequest: async (requestId) => {
    const res = await apiClient.get(`/approvals/requests/${requestId}`);
    return res.data;
  },

  decide: async (requestId, action, comment = "") => {
    const res = await apiClient.post(
      `/approvals/requests/${requestId}/decide`,
      { action, comment },
    );
    return res.data;
  },

  // Returns array of completed requests using server-side status filter
  getHistory: async (statusFilter) => {
    const params = { page: 1, page_size: 50 };
    if (statusFilter) params.status = statusFilter;
    const res = await apiClient.get("/approvals/requests", { params });
    return Array.isArray(res.data) ? res.data : [];
  },

  // Approval flows CRUD
  listFlows: async (modelId) => {
    const params = modelId ? { model_id: modelId } : {};
    const res = await apiClient.get("/approvals/flows", { params });
    return res.data;
  },

  getFlow: async (flowId) => {
    const res = await apiClient.get(`/approvals/flows/${flowId}`);
    return res.data;
  },

  createFlow: async (data) => {
    const res = await apiClient.post("/approvals/flows", data);
    return res.data;
  },

  updateFlow: async (flowId, data) => {
    const res = await apiClient.put(`/approvals/flows/${flowId}`, data);
    return res.data;
  },

  deleteFlow: async (flowId) => {
    await apiClient.delete(`/approvals/flows/${flowId}`);
  },

  getRequestHistory: async (requestId) => {
    const res = await apiClient.get(`/approvals/requests/${requestId}/history`);
    return res.data;
  },

  createRequest: async (data) => {
    const res = await apiClient.post("/approvals/requests", data);
    return res.data;
  },

  cancelRequest: async (requestId) => {
    const res = await apiClient.post(`/approvals/requests/${requestId}/cancel`);
    return res.data;
  },
};
