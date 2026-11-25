import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import InstallButton from '../components/pwa/InstallButton';
import {
  Brain,
  Smartphone,
  Sun,
  Moon,
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const { isDark, toggleTheme } = useTheme();
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
    <div className="landing-page-root single-page-landing">
      {/* Landing Header / Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <div className="landing-logo-badge">
              <Brain size={18} className="logo-brain-icon" />
            </div>
            <div className="landing-brand-text">
              <span className="brand-primary">Personal AI</span>
            </div>
          </div>

          <div className="landing-nav-actions">
            {/* Small Install Button on Landing Navigation */}
            <InstallButton
              variant="landing-small"
              className="landing-header-install-btn"
              label="Install App"
            />

            <button
              type="button"
              onClick={toggleTheme}
              className="btn-landing-theme"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle color theme"
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main 1-Page Landing Content */}
      <main className="landing-main landing-main-centered">
        <section className="landing-hero-section">
          <h1 className="landing-hero-title">
            Your Personal AI, Grounded in <span className="gradient-text">Your Documents</span>
          </h1>

          <p className="landing-hero-desc">
            Upload PDFs, documents, and notes. Teach Personal AI your unique preferences and chat with an intelligent assistant tailored specifically to you.
          </p>

          {/* Call to Action Box */}
          <div className="landing-cta-card">
            <div className="cta-card-header">
              <div className="cta-header-tag">Get Started in Seconds</div>
              <h2 className="cta-card-title">Sign In to Your Workspace</h2>
              <p className="cta-card-subtitle">
                Use your Google account to access your personal knowledge base securely.
              </p>
            </div>

            <div className="cta-card-button-wrapper">
              <GoogleLoginButton onSuccess={handleSuccess} />
            </div>

            {/* Small Install App Pill on Landing Page */}
            <div className="landing-install-bar">
              <div className="install-bar-left">
                <Smartphone size={16} className="install-phone-icon" />
                <div className="install-bar-copy">
                  <span className="install-bar-title">Install Personal AI Web App</span>
                  <span className="install-bar-desc">Home screen access • Works offline • No App Store needed</span>
                </div>
              </div>
              <InstallButton
                variant="landing-pill"
                label="Install App"
              />
            </div>
          </div>
        </section>
      </main>

      {/* Compact Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-left">
            <div className="landing-logo-badge-sm">
              <Brain size={14} className="logo-brain-icon" />
            </div>
            <span>Personal AI © {CURRENT_YEAR}</span>
          </div>
          <div className="footer-right">
            <InstallButton variant="landing-small" label="Install App" />
          </div>
        </div>
      </footer>
    </div>
  );
}
