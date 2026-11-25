import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import ConfirmModal from './common/ConfirmModal';
import { Brain, LogOut, LogIn } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout, appName } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const avatarUrl = user?.avatar_url || user?.profile?.avatar_url;
  const displayName = user?.first_name || user?.username || 'User';

  return (
    <header className="app-navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <div className="logo-icon-box">
            <Brain size={18} className="logo-brain-icon" />
          </div>
          <span className="logo-text">{appName || 'Personal AI'}</span>
        </Link>

        <nav className="nav-links">
          {isAuthenticated ? (
            <div className="nav-user-controls">
              <div className="user-mini-pill">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="nav-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="nav-avatar-fallback">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="nav-user-name">{displayName}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="btn-nav-logout"
                title="Sign Out"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-nav-login">
              <LogIn size={16} />
              <span>Sign In</span>
            </Link>
          )}
        </nav>
      </div>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Log out of Personal AI"
        message="Are you sure you want to log out of your current session?"
        confirmText="Log Out"
        variant="logout"
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </header>
  );
}
