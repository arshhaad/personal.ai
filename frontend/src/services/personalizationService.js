import api from './api';

export const personalizationService = {
  // ==========================================
  // Profile APIs
  // ==========================================
  async getProfile() {
    const response = await api.get('/api/users/me/');
    return response.data;
  },

  async updateProfile(data) {
    const response = await api.patch('/api/users/me/', data);
    return response.data;
  },

  // ==========================================
  // AI Response Preferences
  // ==========================================
  async getAIPreferences() {
    const response = await api.get('/api/personalization/preferences/');
    return response.data;
  },

  async updateAIPreferences(data) {
    const response = await api.patch('/api/personalization/preferences/', data);
    return response.data;
  },

  // ==========================================
  // Personal Information
  // ==========================================
  async getPersonalInfo(category = null) {
    const params = category ? { category } : {};
    const response = await api.get('/api/personalization/information/', { params });
    return response.data;
  },

  async createPersonalInfo(data) {
    const response = await api.post('/api/personalization/information/', data);
    return response.data;
  },

  async updatePersonalInfo(id, data) {
    const response = await api.patch(`/api/personalization/information/${id}/`, data);
    return response.data;
  },

  async deletePersonalInfo(id) {
    const response = await api.delete(`/api/personalization/information/${id}/`);
    return response.data;
  },

  // ==========================================
  // Personal Knowledge: Documents
  // ==========================================
  async getDocuments() {
    const response = await api.get('/api/personalization/documents/');
    return response.data;
  },

  async uploadDocuments(formData, onProgress) {
    const response = await api.post('/api/personalization/documents/upload/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
    return response.data;
  },

  async getDocument(id) {
    const response = await api.get(`/api/personalization/documents/${id}/`);
    return response.data;
  },

  async deleteDocument(id) {
    const response = await api.delete(`/api/personalization/documents/${id}/`);
    return response.data;
  },

  async retryDocument(id) {
    const response = await api.post(`/api/personalization/documents/${id}/retry/`);
    return response.data;
  },

  // ==========================================
  // AI Memory Management
  // ==========================================
  async getMemories() {
    const response = await api.get('/api/personalization/memories/');
    return response.data;
  },

  async createMemory(data) {
    const response = await api.post('/api/personalization/memories/', data);
    return response.data;
  },

  async updateMemory(id, data) {
    const response = await api.patch(`/api/personalization/memories/${id}/`, data);
    return response.data;
  },

  async deleteMemory(id) {
    const response = await api.delete(`/api/personalization/memories/${id}/`);
    return response.data;
  },

  // ==========================================
  // Application Settings & Data Management
  // ==========================================
  async getSettings() {
    const response = await api.get('/api/settings/');
    return response.data;
  },

  async updateSettings(data) {
    const response = await api.patch('/api/settings/', data);
    return response.data;
  },

  async exportData() {
    const response = await api.get('/api/settings/export/');
    return response.data;
  },

  async clearHistory() {
    const response = await api.post('/api/settings/clear-history/');
    return response.data;
  },

  async clearDocuments() {
    const response = await api.post('/api/settings/clear-documents/');
    return response.data;
  },

  async deleteAccount() {
    const response = await api.post('/api/settings/delete-account/');
    return response.data;
  },
};

