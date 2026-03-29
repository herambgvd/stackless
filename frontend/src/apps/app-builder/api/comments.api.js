import { apiClient } from "@/shared/lib/api-client";

const base = (appId, modelSlug, recordId) =>
  `/schema/apps/${appId}/${modelSlug}/records/${recordId}`;

export const commentsApi = {
  listComments: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(
      `${base(appId, modelSlug, recordId)}/comments`,
    );
    return res.data;
  },
  createComment: async (appId, modelSlug, recordId, content, mentions = []) => {
    const res = await apiClient.post(
      `${base(appId, modelSlug, recordId)}/comments`,
      { content, mentions },
    );
    return res.data;
  },
  updateComment: async (appId, modelSlug, recordId, commentId, content) => {
    const res = await apiClient.put(
      `${base(appId, modelSlug, recordId)}/comments/${commentId}`,
      { content },
    );
    return res.data;
  },
  deleteComment: async (appId, modelSlug, recordId, commentId) => {
    await apiClient.delete(
      `${base(appId, modelSlug, recordId)}/comments/${commentId}`,
    );
  },
  getActivity: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(
      `${base(appId, modelSlug, recordId)}/activity`,
    );
    return res.data;
  },
};
