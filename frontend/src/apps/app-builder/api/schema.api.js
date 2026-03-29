import { apiClient } from "@/shared/lib/api-client";

export const schemaApi = {
  // Apps (schema definitions)
  listApps: async (params = {}) => {
    const res = await apiClient.get("/schema/apps", { params });
    return res.data;
  },

  getApp: async (appId) => {
    const res = await apiClient.get(`/schema/apps/${appId}`);
    return res.data;
  },

  createApp: async (data) => {
    const res = await apiClient.post("/schema/apps", data);
    return res.data;
  },

  updateApp: async (appId, data) => {
    const res = await apiClient.put(`/schema/apps/${appId}`, data);
    return res.data;
  },

  deleteApp: async (appId) => {
    await apiClient.delete(`/schema/apps/${appId}`);
  },

  // Models (replaces non-existent /schema endpoint)
  listModels: async (appId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/models`);
    return res.data;
  },

  getModel: async (appId, modelId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/models/${modelId}`);
    return res.data;
  },

  createModel: async (appId, data) => {
    const res = await apiClient.post(`/schema/apps/${appId}/models`, data);
    return res.data;
  },

  updateModel: async (appId, modelId, data) => {
    const res = await apiClient.put(
      `/schema/apps/${appId}/models/${modelId}`,
      data,
    );
    return res.data;
  },

  deleteModel: async (appId, modelId) => {
    await apiClient.delete(`/schema/apps/${appId}/models/${modelId}`);
  },

  // Dynamic Records
  // params can include: page, page_size, sort_field, sort_dir, search, filters (array of {field,operator,value})
  listRecords: async (appId, modelSlug, params = {}) => {
    const { filters, ...rest } = params;
    const queryParams = { ...rest };
    if (filters && filters.length > 0) {
      queryParams.filters = JSON.stringify(filters);
    }
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records`, { params: queryParams });
    return res.data;
  },

  // Fetch records for a relation dropdown (with optional cascade filter)
  // targetAppId allows cross-app relations — falls back to appId (same app)
  listRelationRecords: async (appId, modelSlug, { filterField, filterValue, targetAppId } = {}) => {
    const resolvedAppId = targetAppId || appId;
    const params = { page: 1, page_size: 200, sort_field: "created_at", sort_dir: -1 };
    if (filterField && filterValue) {
      params.filter_field = filterField;
      params.filter_value = filterValue;
    }
    const res = await apiClient.get(`/schema/apps/${resolvedAppId}/${modelSlug}/records`, { params });
    return res.data?.items ?? [];
  },

  // Fetch all models across all apps in tenant — used for cross-app relation picker
  listAllAppsModels: async () => {
    const apps = await schemaApi.listApps();
    const results = await Promise.all(
      apps.map(async (app) => {
        const models = await schemaApi.listModels(app.id);
        return models.map((m) => ({ ...m, _appId: app.id, _appName: app.name }));
      })
    );
    return results.flat();
  },

  getRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}`);
    return res.data;
  },

  createRecord: async (appId, modelSlug, data) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records`, { data });
    return res.data;
  },

  updateRecord: async (appId, modelSlug, recordId, data) => {
    const res = await apiClient.put(`/schema/apps/${appId}/${modelSlug}/records/${recordId}`, { data });
    return res.data;
  },

  deleteRecord: async (appId, modelSlug, recordId) => {
    await apiClient.delete(`/schema/apps/${appId}/${modelSlug}/records/${recordId}`);
  },

  bulkUpdateRecords: async (appId, modelSlug, recordIds, data) => {
    const res = await apiClient.patch(`/schema/apps/${appId}/${modelSlug}/records/bulk`, {
      record_ids: recordIds,
      data,
    });
    return res.data;
  },

  getRecordAudit: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/audit`);
    return res.data;
  },

  // Submit / Cancel / Amend (docstatus lifecycle)
  submitRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/submit`);
    return res.data;
  },
  cancelRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/cancel`);
    return res.data;
  },
  amendRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/amend`);
    return res.data;
  },

  assignRecord: async (appId, modelSlug, recordId, userId, note = null, dueDate = null) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/assign`, {
      user_id: userId ?? null,
      note: note || null,
      due_date: dueDate || null,
    });
    return res.data;
  },

  globalSearch: async (appId, q, limit = 10) => {
    const res = await apiClient.get(`/schema/apps/${appId}/search`, { params: { q, limit } });
    return res.data;
  },

  duplicateRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/duplicate`);
    return res.data;
  },

  lockRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/lock`);
    return res.data;
  },

  unlockRecord: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/unlock`);
    return res.data;
  },

  // Views
  listViews: async (appId, modelSlug) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/views`);
    return res.data;
  },

  createView: async (appId, modelSlug, data) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/views`, data);
    return res.data;
  },

  updateView: async (appId, modelSlug, viewId, data) => {
    const res = await apiClient.put(`/schema/apps/${appId}/${modelSlug}/views/${viewId}`, data);
    return res.data;
  },

  deleteView: async (appId, modelSlug, viewId) => {
    await apiClient.delete(`/schema/apps/${appId}/${modelSlug}/views/${viewId}`);
  },

  // Import / Export
  exportRecordsUrl: (appId, modelSlug, format = 'csv') => {
    // Returns the endpoint path for use with fetch() + blob download
    return `/api/schema/apps/${appId}/${modelSlug}/records/export?format=${format}`;
  },

  importRecords: async (appId, modelSlug, file, columnMap = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (columnMap) {
      formData.append('column_map', JSON.stringify(columnMap));
    }
    const response = await apiClient.post(
      `/schema/apps/${appId}/${modelSlug}/records/import`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  getModelColumns: async (appId, modelSlug) => {
    // Fetch model list to get field definitions for column mapping
    const models = await schemaApi.listModels(appId);
    return models.find((m) => m.slug === modelSlug)?.fields || [];
  },

  // Attachments
  listAttachments: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/attachments`);
    return res.data;
  },
  uploadAttachment: async (appId, modelSlug, recordId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post(
      `/schema/apps/${appId}/${modelSlug}/records/${recordId}/attachments`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data;
  },
  getAttachmentUrl: async (appId, modelSlug, recordId, attachmentId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/attachments/${attachmentId}/url`);
    return res.data;
  },
  deleteAttachment: async (appId, modelSlug, recordId, attachmentId) => {
    await apiClient.delete(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/attachments/${attachmentId}`);
  },

  // Tags
  listTags: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/tags`);
    return res.data;
  },
  addTag: async (appId, modelSlug, recordId, tag) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/tags`, { tag });
    return res.data;
  },
  removeTag: async (appId, modelSlug, recordId, tag) => {
    await apiClient.delete(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/tags/${encodeURIComponent(tag)}`);
  },

  // Favourites
  getFavouriteStatus: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/favourite`);
    return res.data;
  },
  addFavourite: async (appId, modelSlug, recordId) => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/favourite`);
    return res.data;
  },
  removeFavourite: async (appId, modelSlug, recordId) => {
    await apiClient.delete(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/favourite`);
  },

  // Sharing
  listShares: async (appId, modelSlug, recordId) => {
    const res = await apiClient.get(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/shares`);
    return res.data;
  },
  shareRecord: async (appId, modelSlug, recordId, userId, permission = "read") => {
    const res = await apiClient.post(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/shares`, { user_id: userId, permission });
    return res.data;
  },
  removeShare: async (appId, modelSlug, recordId, shareId) => {
    await apiClient.delete(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/shares/${shareId}`);
  },

  // Workflow state transition
  workflowTransition: async (appId, modelSlug, recordId, toState) => {
    const res = await apiClient.post(
      `/schema/apps/${appId}/${modelSlug}/records/${recordId}/workflow-transition`,
      { to_state: toState },
    );
    return res.data;
  },

  // Workflow states on model
  updateWorkflowStates: async (appId, modelId, workflowStates) => {
    const res = await apiClient.put(`/schema/apps/${appId}/models/${modelId}`, { workflow_states: workflowStates });
    return res.data;
  },

  // Custom Fields (field-level CRUD)
  addField: async (appId, modelId, fieldData) => {
    const res = await apiClient.post(`/schema/apps/${appId}/models/${modelId}/fields`, fieldData);
    return res.data;
  },
  updateField: async (appId, modelId, fieldName, fieldData) => {
    const res = await apiClient.put(`/schema/apps/${appId}/models/${modelId}/fields/${fieldName}`, fieldData);
    return res.data;
  },
  deleteField: async (appId, modelId, fieldName) => {
    await apiClient.delete(`/schema/apps/${appId}/models/${modelId}/fields/${fieldName}`);
  },
  reorderFields: async (appId, modelId, fieldNames) => {
    const res = await apiClient.put(`/schema/apps/${appId}/models/${modelId}/fields-order`, fieldNames);
    return res.data;
  },
};
