import api from './api';

export const chatService = {
  /**
   * List all conversations for the authenticated user
   */
  async getConversations() {
    const response = await api.get('/api/conversations/');
    return response.data;
  },

  /**
   * Create a new conversation
   * @param {string} [title]
   */
  async createConversation(title = 'New Chat') {
    const response = await api.post('/api/conversations/', { title });
    return response.data;
  },

  /**
   * Retrieve a single conversation with all its messages
   * @param {number|string} id
   */
  async getConversation(id) {
    const response = await api.get(`/api/conversations/${id}/`);
    return response.data;
  },

  /**
   * Rename a conversation title
   * @param {number|string} id
   * @param {string} title
   */
  async renameConversation(id, title) {
    const response = await api.patch(`/api/conversations/${id}/`, { title });
    return response.data;
  },

  /**
   * Delete a conversation
   * @param {number|string} id
   */
  async deleteConversation(id) {
    const response = await api.delete(`/api/conversations/${id}/`);
    return response.data;
  },

  /**
   * Send a message to a conversation and get the AI response
   * @param {number|string} conversationId
   * @param {string} content
   */
  async sendMessage(conversationId, content) {
    const response = await api.post(`/api/conversations/${conversationId}/messages/`, {
      content,
    });
    return response.data;
  },
};

