import { apiClient } from "@/shared/lib/api-client";

export const authApi = {
  login: async (data) => {
    const res = await apiClient.post("/auth/login", data);
    return res.data;
  },

  register: async (data) => {
    const res = await apiClient.post("/auth/register", data);
    return res.data;
  },

  logout: async (refreshToken) => {
    await apiClient.post("/auth/logout", { refresh_token: refreshToken });
  },

  refreshToken: async (refreshToken) => {
    const res = await apiClient.post("/auth/refresh", { refresh_token: refreshToken });
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get("/auth/me");
    return res.data;
  },

  updateMe: async (data) => {
    const res = await apiClient.put("/auth/me", data);
    return res.data;
  },

  changePassword: async (data) => {
    await apiClient.post("/auth/me/change-password", data);
  },

  verify2fa: async (data) => {
    const res = await apiClient.post("/auth/2fa/verify", data);
    return res.data;
  },

  forgotPassword: async (email) => {
    await apiClient.post("/auth/forgot-password", { email });
  },

  resetPassword: async (token, new_password) => {
    await apiClient.post("/auth/reset-password", { token, new_password });
  },

  forceChangePassword: async (data) => {
    await apiClient.post("/auth/force-change-password", data);
  },
};
