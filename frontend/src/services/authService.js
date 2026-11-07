import api from './api';

export const authService = {
  /**
   * Get Google OAuth 2.0 Authorization URL for initiating login
   * @param {string} redirectUri
   */
  async getGoogleAuthUrl(redirectUri) {
    const params = redirectUri ? { redirect_uri: redirectUri } : {};
    const response = await api.get('/api/auth/google/url/', { params });
    return response.data;
  },

  /**
   * Handle Google OAuth redirect callback with authorization code
   * @param {Object} data { code: string, redirect_uri: string }
   */
  async handleGoogleCallback(data) {
    const response = await api.post('/api/auth/google/callback/', data);
    return response.data;
  },

  /**
   * Authenticate with backend using Google credentials/code
   * @param {Object} payload { credential?: string, code?: string, access_token?: string }
   */
  async googleAuth(payload) {
    const response = await api.post('/api/auth/google/', payload);
    return response.data;
  },

  /**
   * Fetch current authenticated user's profile
   */
  async getProfile() {
    const response = await api.get('/api/auth/me/');
    return response.data;
  },

  /**
   * Refresh JWT token
   * @param {string} refreshToken
   */
  async refreshToken(refreshToken) {
    const response = await api.post('/api/auth/token/refresh/', {
      refresh: refreshToken,
    });
    return response.data;
  },

  /**
   * Logout and invalidate session
   * @param {string} refreshToken
   */
  async logout(refreshToken) {
    try {
      await api.post('/api/auth/logout/', { refresh: refreshToken });
    } catch {
      // Ignore network/server errors during logout
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_user');
    }
  },
};
