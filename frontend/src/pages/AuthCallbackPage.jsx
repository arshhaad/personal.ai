import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        setErrorMsg(`Google authorization returned an error: ${error}`);
        return;
      }

      if (!code) {
        setErrorMsg('No authorization code was found in the Google redirect response.');
        return;
      }

      try {
        const redirectUri = window.location.origin + '/auth/callback';
        await handleOAuthCallback(code, redirectUri);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setErrorMsg(err.message || 'Failed to complete Google authentication.');
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, navigate]);

  return (
    <div className="flex-center-screen">
      {errorMsg ? (
        <div className="callback-error-card">
          <AlertCircle size={36} color="#ef4444" />
          <h2>Authentication Failed</h2>
          <p>{errorMsg}</p>
          <Link to="/login" className="btn-action primary">
            <ArrowLeft size={16} />
            <span>Return to Login</span>
          </Link>
        </div>
      ) : (
        <div className="loading-spinner-wrapper">
          <Loader2 className="spinner-icon animate-spin" size={38} />
          <h2>Completing Google Sign In...</h2>
          <p>Exchanging credentials and securing your session</p>
        </div>
      )}
    </div>
  );
}

