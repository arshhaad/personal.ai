import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
  Save,
  Loader2,
} from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    preferred_name: '',
    phone_number: '',
    avatar_url: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    personalizationService.getProfile()
      .then((data) => {
        if (isMounted) {
          setFormData({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            preferred_name: data.profile?.preferred_name || '',
            phone_number: data.profile?.phone_number || '',
            avatar_url: data.avatar_url || data.profile?.avatar_url || '',
          });
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load profile:', err);
          showToast('Failed to load profile details.', 'error', 3000);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [showToast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await personalizationService.updateProfile(formData);
      await refreshUserData();
      showToast('Profile updated successfully!', 'success', 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      showToast(err.response?.data?.detail || 'Failed to update profile. Please try again.', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  const displayName = [formData.first_name, formData.last_name].filter(Boolean).join(' ') || user?.username || 'User';
  const accountCreated = user?.date_joined
    ? new Date(user.date_joined).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Authenticated';

  return (
    <div className="settings-page-container">
      {/* Top Header */}
      <div className="settings-header">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="btn-back-chat"
          title="Back to Chat"
        >
          <ArrowLeft size={16} />
          <span>Back to Chat</span>
        </button>

        <div className="settings-title-section">
          <div className="settings-badge">
            <User size={16} />
            <span>Account Profile</span>
          </div>
          <h1>Profile</h1>
          <p>Manage your account credentials, display preferences, and authenticated Google identity.</p>
        </div>
      </div>

      {loading ? (
        <div className="settings-loading-card">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading profile details...</p>
        </div>
      ) : (
        <div className="settings-body-card">
          {/* Visual Header / Avatar Banner */}
          <div className="profile-identity-card">
            <div className="profile-hero-avatar">
              {formData.avatar_url ? (
                <img
                  src={formData.avatar_url}
                  alt={displayName}
                  className="profile-lg-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="profile-lg-fallback">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="profile-auth-badge" title="Verified via Google">
                <ShieldCheck size={16} />
              </span>
            </div>

            <div className="profile-hero-info">
              <h2 className="profile-display-name">
                {formData.preferred_name || displayName}
              </h2>
              <span className="profile-email-meta">{user?.email}</span>
              <div className="profile-tags-row">
                <span className="tag-pill provider">
                  <svg viewBox="0 0 24 24" width="13" height="13" className="google-svg">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                  </svg>
                  <span>Google OAuth 2.0</span>
                </span>
                <span className="tag-pill date">
                  <Calendar size={13} />
                  <span>Joined {accountCreated}</span>
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="profile-edit-form">
            <h3 className="section-subheading">Personal Details</h3>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="First Name"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Last Name"
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Preferred Name (Display Name)</label>
                <input
                  type="text"
                  name="preferred_name"
                  value={formData.preferred_name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="What Personal AI should call you"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number (Optional)</label>
                <div className="input-with-icon">
                  <Phone size={16} className="input-icon" />
                  <input
                    type="tel"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleChange}
                    className="form-input icon-padded"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Profile Picture URL</label>
              <input
                type="url"
                name="avatar_url"
                value={formData.avatar_url}
                onChange={handleChange}
                className="form-input"
                placeholder="https://..."
              />
              <span className="input-hint">
                By default, this is synchronized with your verified Google account avatar.
              </span>
            </div>

            <h3 className="section-subheading">Security & Read-Only Credentials</h3>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Verified Email Address</label>
                <div className="input-with-icon">
                  <Mail size={16} className="input-icon" />
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="form-input icon-padded disabled"
                  />
                </div>
                <span className="input-hint">Managed securely via Google OAuth.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Google Account ID (Sub)</label>
                <input
                  type="text"
                  value={user?.profile?.google_id || 'Connected'}
                  disabled
                  className="form-input disabled code-font"
                />
                <span className="input-hint">Protected authentication identifier.</span>
              </div>
            </div>

            <div className="profile-form-actions">
              <button
                type="submit"
                disabled={saving}
                className="btn-save-profile"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
