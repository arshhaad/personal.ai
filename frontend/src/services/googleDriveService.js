import api from './api';

export const googleDriveService = {
  /**
   * Get Google Drive connection status and permission details
   */
  async getStatus() {
    const response = await api.get('/api/drive/status/');
    return response.data;
  },

  /**
   * Connect Google Drive with authorization code or token
   * Scope: https://www.googleapis.com/auth/drive.file
   * @param {Object} data { code?: string, access_token?: string, redirect_uri?: string }
   */
  async connect(data) {
    const response = await api.post('/api/drive/connect/', data);
    return response.data;
  },

  /**
   * Disconnect Google Drive and revoke token
   */
  async disconnect() {
    const response = await api.post('/api/drive/disconnect/');
    return response.data;
  },

  /**
   * List accessible files in user's Google Drive
   */
  async getFiles() {
    const response = await api.get('/api/drive/files/');
    return response.data;
  },

  /**
   * Import a file from Google Drive into Personal AI knowledge base
   * @param {Object} payload { file_id: string, name: string, mime_type?: string }
   */
  async importFile(payload) {
    const response = await api.post('/api/drive/import/', payload);
    return response.data;
  },

  /**
   * List documents uploaded through this web application and their Google Drive folder sync status
   */
  async getAppUploadedDocuments() {
    const response = await api.get('/api/settings/app-documents/');
    return response.data;
  },

  /**
   * Delete an individual document uploaded through this web application
   * (deletes from app and user's Google Drive folder)
   * @param {number|string} id
   */
  async deleteAppUploadedDocument(id) {
    const response = await api.delete(`/api/settings/app-documents/${id}/`);
    return response.data;
  },

  /**
   * Clear all documents uploaded through this web application
   * (deletes from app and user's Google Drive folder)
   */
  async clearAppUploadedDocuments() {
    const response = await api.post('/api/settings/app-documents/clear/');
    return response.data;
  },
};
