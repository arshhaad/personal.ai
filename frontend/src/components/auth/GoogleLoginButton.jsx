import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { Loader2, AlertCircle } from 'lucide-react';

const LOGIN_WORKSPACE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export default function GoogleLoginButton({ onSuccess }) {
  const { loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const triggerCodeLogin = useGoogleLogin({
    flow: 'auth-code',
    ux_mode: 'popup',
    scope: LOGIN_WORKSPACE_SCOPES,
    include_granted_scopes: true,
    onSuccess: async (codeResponse) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        await loginWithGoogle({ code: codeResponse.code });
        if (onSuccess) onSuccess();
      } catch (err) {
        const msg = err.message || 'Failed to authenticate with Google.';
        setErrorMessage(msg);
        showToast(msg, 'error', 3000);
      } finally {
        setLoading(false);
      }
    },
    onError: (errorResponse) => {
      const msg = errorResponse.error_description || 'Google authentication was cancelled.';
      setErrorMessage(msg);
      showToast(msg, 'error', 3000);
    },
  });

  return (
    <div className="google-auth-container">
      {errorMessage && (
        <div className="auth-error-banner">
          <AlertCircle size={18} className="error-icon" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="auth-loading-pill">
          <Loader2 size={20} className="animate-spin" />
          <span>Authenticating with Google...</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => triggerCodeLogin()}
          className="custom-google-btn"
          disabled={loading}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
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
          <span>Continue with Google</span>
        </button>
      )}
    </div>
  );
}
