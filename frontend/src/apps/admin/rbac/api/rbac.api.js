import { apiClient } from "@/shared/lib/api-client";

export const rbacApi = {
  // Roles
  listRoles: async () => {
    const res = await apiClient.get("/rbac/roles");
    return res.data;
  },

  createRole: async (data) => {
    const res = await apiClient.post("/rbac/roles", data);
    return res.data;
  },

  updateRole: async (roleId, data) => {
    const res = await apiClient.put(`/rbac/roles/${roleId}`, data);
    return res.data;
  },

  deleteRole: async (roleId) => {
    await apiClient.delete(`/rbac/roles/${roleId}`);
  },

  // User-role assignments (use backend's /roles/assign and /roles/revoke)
  assignRole: async (userId, roleName) => {
    const res = await apiClient.post("/rbac/roles/assign", {
      user_id: userId,
      role_name: roleName,
    });
    return res.data;
  },

  removeRole: async (userId, roleName) => {
    const res = await apiClient.post("/rbac/roles/revoke", {
      user_id: userId,
      role_name: roleName,
    });
    return res.data;
  },

  // User permissions
  getUserPermissions: async (userId) => {
    const res = await apiClient.get(`/rbac/users/${userId}/permissions`);
    return res.data;
  },

  // Role Profiles
  listRoleProfiles: async () => {
    const res = await apiClient.get("/rbac/role-profiles");
    return res.data;
  },
  createRoleProfile: async (data) => {
    const res = await apiClient.post("/rbac/role-profiles", data);
    return res.data;
  },
  updateRoleProfile: async (profileId, data) => {
    const res = await apiClient.put(`/rbac/role-profiles/${profileId}`, data);
    return res.data;
  },
  deleteRoleProfile: async (profileId) => {
    await apiClient.delete(`/rbac/role-profiles/${profileId}`);
  },
  assignProfileToUser: async (profileId, userId) => {
    const res = await apiClient.post(`/rbac/role-profiles/${profileId}/assign`, { user_id: userId });
    return res.data;
  },
};
