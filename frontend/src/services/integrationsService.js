import api from './api';

export const integrationsService = {
  // --- Unified Google Workspace (Calendar + Gmail for signed-in account) ---
  async connectWorkspace(data) {
    const response = await api.post('/api/integrations/workspace/connect/', data);
    return response.data;
  },

  // --- Google Calendar ---
  async getCalendarStatus() {
    const response = await api.get('/api/integrations/calendar/status/');
    return response.data;
  },

  async connectCalendar(data) {
    const response = await api.post('/api/integrations/calendar/connect/', data);
    return response.data;
  },

  async disconnectCalendar() {
    const response = await api.post('/api/integrations/calendar/disconnect/');
    return response.data;
  },

  async getCalendarEvents(days = 14) {
    const response = await api.get('/api/integrations/calendar/events/', {
      params: { days },
    });
    return response.data;
  },

  async createCalendarEvent(payload) {
    const response = await api.post('/api/integrations/calendar/events/', payload);
    return response.data;
  },

  async deleteCalendarEvent(eventId) {
    const response = await api.delete(`/api/integrations/calendar/events/${encodeURIComponent(eventId)}/`);
    return response.data;
  },

  // --- Gmail ---
  async getGmailStatus() {
    const response = await api.get('/api/integrations/gmail/status/');
    return response.data;
  },

  async connectGmail(data) {
    const response = await api.post('/api/integrations/gmail/connect/', data);
    return response.data;
  },

  async disconnectGmail() {
    const response = await api.post('/api/integrations/gmail/disconnect/');
    return response.data;
  },

  async getGmailMessages(query = '') {
    const response = await api.get('/api/integrations/gmail/messages/', {
      params: query ? { q: query } : {},
    });
    return response.data;
  },

  async sendGmailMessage(payload) {
    const response = await api.post('/api/integrations/gmail/send/', payload);
    return response.data;
  },

  // --- Web Search ---
  async searchWeb(query, maxResults = 5) {
    const response = await api.post('/api/integrations/web-search/', {
      query,
      max_results: maxResults,
    });
    return response.data;
  },

  // --- Notifications ---
  async getNotifications() {
    const response = await api.get('/api/notifications/');
    return response.data;
  },

  async markNotificationRead(id) {
    const response = await api.post(`/api/notifications/${id}/read/`);
    return response.data;
  },

  async deleteNotification(id) {
    const response = await api.delete(`/api/notifications/${id}/`);
    return response.data;
  },

  async markAllNotificationsRead() {
    const response = await api.post('/api/notifications/read-all/');
    return response.data;
  },

  async clearNotifications() {
    const response = await api.post('/api/notifications/clear/');
    return response.data;
  },
};
