import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import InstallButton from '../components/pwa/InstallButton';
import {
  Sparkles,
  Brain,
  FileText,
  Shield,
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
    <div className="landing-page-root">
      {/* Landing Header / Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <div className="landing-logo-badge">
              <Brain size={20} className="landing-logo-icon" />
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

      {/* Main Landing Content */}
      <main className="landing-main">
        {/* Hero Section */}
        <section className="landing-hero-section">
          <div className="landing-hero-badge">
            <Sparkles size={14} className="sparkle-anim" />
            <span>Next-Gen Knowledge Assistant</span>
          </div>

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

        {/* Interactive Feature Highlights */}
        <section className="landing-features-section">
          <div className="features-section-header">
            <div className="section-mini-badge">Core Capabilities</div>
            <h2 className="features-title">Designed for Your Workflow</h2>
            <p className="features-subtitle">Everything you need from a modern, privacy-focused AI assistant.</p>
          </div>

          <div className="features-grid">
            <div className="feature-item-card">
              <div className="feature-icon-box">
                <FileText size={22} className="feature-icon" />
              </div>
              <h3 className="feature-name">Document Grounding</h3>
              <p className="feature-desc">
                Upload PDF, DOCX, TXT, and Markdown files up to 10MB. Ask questions and get cited answers directly from your uploads.
              </p>
            </div>

            <div className="feature-item-card">
              <div className="feature-icon-box">
                <Brain size={22} className="feature-icon" />
              </div>
              <h3 className="feature-name">Custom Persona & Memory</h3>
              <p className="feature-desc">
                Define your occupation, preferred name, and custom system instructions. Personal AI adapts its tone and thinking to you.
              </p>
            </div>

            <div className="feature-item-card">
              <div className="feature-icon-box">
                <Smartphone size={22} className="feature-icon" />
              </div>
              <h3 className="feature-name">Mobile-First PWA</h3>
              <p className="feature-desc">
                Install directly on iOS, Android, macOS, or Windows with one click. Enjoy a fluid, touch-optimized app experience anywhere.
              </p>
            </div>

            <div className="feature-item-card">
              <div className="feature-icon-box">
                <Shield size={22} className="feature-icon" />
              </div>
              <h3 className="feature-name">Zero-Leak Privacy</h3>
              <p className="feature-desc">
                Protected by Django SimpleJWT session tokens and Google OAuth 2.0. Your data stays strictly yours.
              </p>
            </div>
          </div>
        </section>

        {/* Visual Preview / Demo Card */}
        <section className="landing-preview-section">
          <div className="preview-card-frame">
            <div className="preview-top-bar">
              <div className="preview-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <div className="preview-bar-title">Personal AI Assistant</div>
              <div className="preview-badge">Live Preview</div>
            </div>

            <div className="preview-chat-body">
              <div className="preview-msg user">
                <div className="preview-bubble user-bubble">
                  Can you summarize section 3 of my uploaded Q3 Financial Report?
                </div>
              </div>

              <div className="preview-msg assistant">
                <div className="preview-avatar">
                  <Sparkles size={15} />
                </div>
                <div className="preview-bubble assistant-bubble">
                  <p>Based on <strong>Q3 Financial Report.pdf</strong> (Page 14):</p>
                  <ul className="preview-bullet-list">
                    <li><strong>Revenue Growth:</strong> Net quarterly revenue grew 24.3% YoY to $4.2M.</li>
                    <li><strong>Operating Margin:</strong> Improved by 380 bps driven by automation efficiencies.</li>
                    <li><strong>Customer Retention:</strong> Net Revenue Retention reached 118%.</li>
                  </ul>
                  <div className="preview-cite-chip">
                    <FileText size={12} />
                    <span>Source: Q3 Financial Report.pdf • 98% Match</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Responsive Mobile How It Works */}
        <section className="landing-steps-section">
          <div className="step-card">
            <div className="step-number">01</div>
            <h4>Sign in with Google</h4>
            <p>One-click secure login with no extra passwords to memorize.</p>
          </div>
          <div className="step-card">
            <div className="step-number">02</div>
            <h4>Add Your Knowledge</h4>
            <p>Upload your research documents or customize system instructions.</p>
          </div>
          <div className="step-card">
            <div className="step-number">03</div>
            <h4>Install & Chat</h4>
            <p>Use on any phone, tablet, or laptop like a native mobile app.</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-left">
            <Brain size={16} />
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
