import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import {
  SlidersHorizontal,
  User,
  Settings,
  LogOut,
  ChevronUp,
} from 'lucide-react';

export default function ProfileDropdown({ isCollapsed = false, onSelect }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'User';
  const avatarUrl = user?.avatar_url || user?.profile?.avatar_url;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleOptionClick = (action) => {
    setIsOpen(false);
    if (onSelect) onSelect(action);

    switch (action) {
      case 'personalization':
        navigate('/personalization');
        break;
      case 'profile':
        navigate('/profile');
        break;
      case 'settings':
        navigate('/settings');
        break;
      case 'logout':
        logout();
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`profile-dropdown-container ${isCollapsed ? 'collapsed' : ''}`}
    >
      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="profile-dropdown-menu" role="menu">
          <div className="dropdown-menu-list">
            <button
              type="button"
              className="dropdown-menu-item"
              role="menuitem"
              onClick={() => handleOptionClick('personalization')}
            >
              <SlidersHorizontal size={16} className="dropdown-item-icon" />
              <span className="dropdown-item-label">Personalization</span>
            </button>

            <button
              type="button"
              className="dropdown-menu-item"
              role="menuitem"
              onClick={() => handleOptionClick('profile')}
            >
              <User size={16} className="dropdown-item-icon" />
              <span className="dropdown-item-label">Profile</span>
            </button>

            <button
              type="button"
              className="dropdown-menu-item"
              role="menuitem"
              onClick={() => handleOptionClick('settings')}
            >
              <Settings size={16} className="dropdown-item-icon" />
              <span className="dropdown-item-label">Settings</span>
            </button>

            <div className="dropdown-divider" role="separator" />

            <button
              type="button"
              className="dropdown-menu-item item-logout"
              role="menuitem"
              onClick={() => handleOptionClick('logout')}
            >
              <LogOut size={16} className="dropdown-item-icon" />
              <span className="dropdown-item-label">Log out</span>
            </button>
          </div>
        </div>
      )}

      {/* Trigger: Profile Button at bottom of sidebar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`profile-trigger-btn ${isOpen ? 'active' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title={displayName}
      >
        <div className="profile-avatar-wrapper">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="profile-user-avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="profile-avatar-fallback">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {!isCollapsed && (
          <>
            <div className="profile-text-meta">
              <span className="profile-user-name" title={displayName}>
                {displayName}
              </span>
              <span className="profile-user-email" title={user?.email}>
                {user?.email}
              </span>
            </div>

            <ChevronUp
              size={16}
              className={`profile-dropdown-arrow ${isOpen ? 'arrow-open' : ''}`}
            />
          </>
        )}
      </button>
    </div>
  );
}
