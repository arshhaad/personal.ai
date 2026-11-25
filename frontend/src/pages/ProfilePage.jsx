import { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import WorkspaceSidebarLayout from '../components/layout/WorkspaceSidebarLayout';
import {
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
  Save,
  Loader2,
} from 'lucide-react';

export default function ProfilePage() {
  const { user, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    preferred_name: '',
    phone_number: '',
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

  const avatarUrl = user?.avatar_url || user?.profile?.avatar_url;
  const displayName = [formData.first_name, formData.last_name].filter(Boolean).join(' ') || user?.username || 'User';
  const accountCreated = user?.date_joined
    ? new Date(user.date_joined).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Authenticated';

  return (
    <WorkspaceSidebarLayout title="Profile">
      <div className="settings-sections-wrapper">
        <div className="workspace-page-intro">
          <h1>Profile</h1>
          <p>Manage your personal details and display preferences.</p>
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
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="profile-lg-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="profile-lg-fallback">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="profile-auth-badge" title="Verified Account">
                  <ShieldCheck size={15} />
                </span>
              </div>

              <div className="profile-hero-info">
                <h2 className="profile-display-name">
                  {formData.preferred_name || displayName}
                </h2>
                <span className="profile-email-meta">{user?.email}</span>
                <div className="profile-tags-row">
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
                <span className="input-hint">Managed securely via your signed-in Google account.</span>
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
    </WorkspaceSidebarLayout>
  );
}
