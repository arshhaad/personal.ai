import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import { Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/chat';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSuccess = () => {
    navigate(from, { replace: true });
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-card-container">
        <div className="login-header">
          <div className="login-badge">
            <Sparkles size={16} />
            <span>Welcome to Personal AI</span>
          </div>
          <h1 className="login-title">Personal AI</h1>
          <p className="login-subtitle">
            Your Own Knowledge-Based AI Assistant
          </p>
        </div>

        <div className="login-action-box">
          <GoogleLoginButton onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
