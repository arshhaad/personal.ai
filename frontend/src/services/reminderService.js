import api from './api';

export const reminderService = {
  async getReminders() {
    const response = await api.get('/api/reminders/');
    return response.data;
  },

  async createReminder(payload) {
    const response = await api.post('/api/reminders/', payload);
    return response.data;
  },

  async updateReminder(id, payload) {
    const response = await api.patch(`/api/reminders/${id}/`, payload);
    return response.data;
  },

  async deleteReminder(id) {
    const response = await api.delete(`/api/reminders/${id}/`);
    return response.data;
  },

  async snoozeReminder(id, minutes) {
    const response = await api.post(`/api/reminders/${id}/snooze/`, { minutes });
    return response.data;
  },

  async completeReminder(id) {
    const response = await api.post(`/api/reminders/${id}/complete/`);
    return response.data;
  },

  async clearHistory() {
    const response = await api.post('/api/reminders/history/clear/');
    return response.data;
  },
};
