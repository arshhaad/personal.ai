import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { authService } from '../../services/authService';
import {
  Mail,
  ShieldCheck,
  Key,
  LogOut,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

export default function UserProfileCard() {
  const { user, logout, accessToken, refreshUserData } = useAuth();
  const [testingApi, setTestingApi] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showTokens, setShowTokens] = useState(false);

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Google User';
  const avatarUrl = user?.avatar_url || user?.profile?.avatar_url;
  const googleId = user?.profile?.google_id || user?.google_id || 'Connected';

  const handleTestApi = async () => {
    setTestingApi(true);
    try {
      const data = await authService.getProfile();
      await refreshUserData();
      setApiResponse({ success: true, data });
    } catch (err) {
      setApiResponse({
        success: false,
        error: err.response?.data || err.message,
      });
    } finally {
      setTestingApi(false);
    }
  };

  const handleCopyToken = () => {
    if (accessToken) {
      navigator.clipboard.writeText(accessToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="profile-card">
      <div className="profile-card-header">
        <div className="avatar-container">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="user-avatar-img"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="user-avatar-fallback">
              {fullName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="google-badge-overlay" title="Verified Google Account">
            <ShieldCheck size={14} color="#fff" />
          </span>
        </div>

        <div className="profile-main-meta">
          <h2 className="user-name">{fullName}</h2>
          <div className="user-email-row">
            <Mail size={15} />
            <span>{user?.email}</span>
          </div>
          <div className="provider-pill">
            <svg viewBox="0 0 24 24" width="14" height="14" className="google-mini-icon">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Google OAuth 2.0 Account</span>
          </div>
        </div>
      </div>

      <div className="profile-details-grid">
        <div className="detail-item">
          <span className="detail-label">Django User ID</span>
          <span className="detail-value">#{user?.id}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Username</span>
          <span className="detail-value">{user?.username}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Google Sub ID</span>
          <span className="detail-value code-font" title={googleId}>
            {googleId.length > 18 ? `${googleId.substring(0, 16)}...` : googleId}
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Auth Method</span>
          <span className="detail-value status-active">JWT (SimpleJWT)</span>
        </div>
      </div>

      <div className="profile-actions-bar">
        <button
          type="button"
          onClick={handleTestApi}
          className="btn-action primary"
          disabled={testingApi}
        >
          <RefreshCw size={16} className={testingApi ? 'animate-spin' : ''} />
          <span>{testingApi ? 'Testing...' : 'Test Backend Auth API (/me)'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowTokens(!showTokens)}
          className="btn-action secondary"
        >
          <Key size={16} />
          <span>{showTokens ? 'Hide JWT' : 'View JWT Session'}</span>
        </button>

        <button
          type="button"
          onClick={logout}
          className="btn-action danger"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>

      {apiResponse && (
        <div className={`api-test-result ${apiResponse.success ? 'success' : 'error'}`}>
          <div className="result-header">
            <strong>Endpoint Response (GET /api/auth/me/):</strong>
            <span className="status-tag">{apiResponse.success ? '200 OK' : 'Failed'}</span>
          </div>
          <pre>{JSON.stringify(apiResponse.data || apiResponse.error, null, 2)}</pre>
        </div>
      )}

      {showTokens && (
        <div className="token-inspector">
          <div className="token-header">
            <span>Active Bearer Access Token</span>
            <button
              type="button"
              onClick={handleCopyToken}
              className="btn-copy"
              title="Copy to clipboard"
            >
              {copiedToken ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copiedToken ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <textarea
            readOnly
            className="token-textarea"
            value={accessToken || 'No token active'}
          />
        </div>
      )}
    </div>
  );
}
