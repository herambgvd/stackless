import { apiClient } from "@/shared/lib/api-client";

export const usersApi = {
  listUsers: async () => {
    const res = await apiClient.get("/auth/users");
    return res.data;
  },

  inviteUser: async (data) => {
    const res = await apiClient.post("/auth/users/invite", data);
    return res.data;
  },

  updateUser: async (userId, data) => {
    const res = await apiClient.put(`/auth/users/${userId}`, data);
    return res.data;
  },

  removeUser: async (userId) => {
    await apiClient.delete(`/auth/users/${userId}`);
  },
};
