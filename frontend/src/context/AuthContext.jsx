import { useState, useEffect } from 'react';
import { AuthContext } from './AuthContextDefinition';
import { authService } from '../services/authService';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('access_token'));
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('refresh_token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const profile = await authService.getProfile();
          setUser(profile);
          localStorage.setItem('auth_user', JSON.stringify(profile));
        } catch {
          // Handled by api interceptor
        }
      }
      setLoading(false);
    };

    initAuth();

    const handleExternalLogout = () => {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
    };

    window.addEventListener('auth:logout', handleExternalLogout);
    return () => window.removeEventListener('auth:logout', handleExternalLogout);
  }, []);

  const loginWithGoogle = async (authResponse) => {
    setLoading(true);
    setError(null);
    try {
      let payload = {};
      if (authResponse.credential) {
        payload = { credential: authResponse.credential };
      } else if (authResponse.code) {
        payload = { code: authResponse.code };
      } else if (authResponse.access_token) {
        payload = { access_token: authResponse.access_token };
      } else {
        throw new Error('No valid Google credential or authorization code received.');
      }

      const data = await authService.googleAuth(payload);

      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      setUser(data.user);
      return data;
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        'Authentication with Google failed.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthCallback = async (code, redirectUri) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.handleGoogleCallback({
        code,
        redirect_uri: redirectUri,
      });

      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      setUser(data.user);
      return data;
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        'Failed to process OAuth callback.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout(refreshToken);
    } finally {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      setLoading(false);
    }
  };

  const refreshUserData = async () => {
    try {
      const profile = await authService.getProfile();
      setUser(profile);
      localStorage.setItem('auth_user', JSON.stringify(profile));
      return profile;
    } catch (err) {
      console.error('Failed to update user profile:', err);
    }
  };

  const value = {
    user,
    accessToken,
    refreshToken,
    isAuthenticated: !!accessToken && !!user,
    loading,
    error,
    loginWithGoogle,
    handleOAuthCallback,
    logout,
    refreshUserData,
    setError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
