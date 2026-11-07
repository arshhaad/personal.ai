import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { Sparkles, LogOut, LogIn } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const avatarUrl = user?.avatar_url || user?.profile?.avatar_url;
  const displayName = user?.first_name || user?.username || 'User';

  return (
    <header className="app-navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <div className="logo-icon-box">
            <Sparkles size={20} className="logo-sparkle" />
          </div>
          <span className="logo-text">Personal AI</span>
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
                onClick={logout}
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
    </header>
  );
}
