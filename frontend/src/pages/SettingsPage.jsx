import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Laptop,
  Shield,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
  LogOut,
} from 'lucide-react';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme: setAppTheme } = useTheme();
  const { showToast } = useToast();

  const [settings, setSettings] = useState({
    theme: 'dark',
    enter_to_send: true,
    notifications_enabled: false,
    display_mode: 'comfortable',
    memory_enabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Destructive Modals State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null, // 'history', 'documents', 'account'
    title: '',
    message: '',
    confirmText: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const showNotification = useCallback((msg, isError = false) => {
    showToast(msg, isError ? 'error' : 'success', 3000);
  }, [showToast]);

  useEffect(() => {
    let isMounted = true;
    personalizationService.getSettings()
      .then((data) => {
        if (isMounted) {
          setSettings(data);
          if (data?.theme) {
            setAppTheme(data.theme);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load settings:', err);
          showNotification('Failed to load settings from server.', true);
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
  }, [setAppTheme, showNotification]);

  const handleThemeChange = (newTheme) => {
    setAppTheme(newTheme);
    handleUpdateSetting('theme', newTheme);
  };

  const handleUpdateSetting = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await personalizationService.updateSettings({ [key]: value });
      showNotification('Settings saved.');
    } catch (err) {
      console.error('Failed to update setting:', err);
      showNotification('Failed to save settings.', true);
    }
  };

  // Export Data JSON
  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await personalizationService.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `personal_ai_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('Personal data exported successfully.');
    } catch (err) {
      console.error('Export error:', err);
      showNotification('Failed to export personal data.', true);
    } finally {
      setExporting(false);
    }
  };

  // Open confirmation modal for destructive operations
  const openConfirm = (type) => {
    if (type === 'history') {
      setConfirmModal({
        isOpen: true,
        type: 'history',
        title: 'Clear Conversation History',
        message: 'Are you sure you want to delete all your conversations? This action cannot be undone.',
        confirmText: 'Clear All Chats',
      });
    } else if (type === 'documents') {
      setConfirmModal({
        isOpen: true,
        type: 'documents',
        title: 'Delete All Uploaded Documents',
        message: 'This will permanently remove all uploaded documents and their extracted knowledge text from your private knowledge base.',
        confirmText: 'Delete All Documents',
      });
    } else if (type === 'account') {
      setConfirmModal({
        isOpen: true,
        type: 'account',
        title: 'Delete Personal AI Account',
        message: 'Permanently deletes your account, personal preferences, memories, uploaded documents, and all chats. This action is irreversible.',
        confirmText: 'Permanently Delete My Account',
      });
    }
  };

  const handleExecuteDestructiveAction = async () => {
    setActionLoading(true);
    try {
      if (confirmModal.type === 'history') {
        const res = await personalizationService.clearHistory();
        showNotification(res.message || 'Chat history cleared.');
      } else if (confirmModal.type === 'documents') {
        const res = await personalizationService.clearDocuments();
        showNotification(res.message || 'Uploaded documents deleted.');
      } else if (confirmModal.type === 'account') {
        await personalizationService.deleteAccount();
        logout();
        return;
      }
      setConfirmModal({ isOpen: false, type: null, title: '', message: '', confirmText: '' });
    } catch (err) {
      console.error('Destructive action failed:', err);
      showNotification('Operation failed. Please try again.', true);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="settings-page-container">
      {/* Header */}
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
            <SettingsIcon size={16} />
            <span>Application Settings</span>
          </div>
          <h1>Settings</h1>
          <p>Customize app appearance, chat preferences, data privacy, security, and account management.</p>
        </div>
      </div>

      {loading ? (
        <div className="settings-loading-card">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading application settings...</p>
        </div>
      ) : (
        <div className="settings-sections-wrapper">
          {/* ============================================================== */}
          {/* SECTION A: APPEARANCE                                          */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <h3 className="settings-card-title">A. Appearance</h3>
            <p className="settings-card-desc">Choose how the Personal AI user interface looks on your device.</p>

            <div className="appearance-theme-picker">
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                className={`theme-option-box ${theme === 'light' ? 'selected' : ''}`}
              >
                <Sun size={24} className="theme-icon" />
                <span className="theme-name">Light</span>
                <span className="theme-desc">Clean, high contrast light mode</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={`theme-option-box ${theme === 'dark' ? 'selected' : ''}`}
              >
                <Moon size={24} className="theme-icon" />
                <span className="theme-name">Dark</span>
                <span className="theme-desc">Modern sleek dark background</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('system')}
                className={`theme-option-box ${theme === 'system' ? 'selected' : ''}`}
              >
                <Laptop size={24} className="theme-icon" />
                <span className="theme-name">System Default</span>
                <span className="theme-desc">Synchronize with your OS theme</span>
              </button>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION B: CHAT PREFERENCES                                    */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <h3 className="settings-card-title">B. Chat Preferences</h3>
            <p className="settings-card-desc">Fine-tune message sending behavior and visual display density.</p>

            <div className="settings-rows-list">
              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Press Enter to Send</span>
                  <span className="toggle-desc">Send messages instantly when pressing Enter; Shift+Enter creates a new line.</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.enter_to_send}
                    onChange={(e) => handleUpdateSetting('enter_to_send', e.target.checked)}
                  />
                  <span className="toggle-slider round" />
                </label>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Message Notifications</span>
                  <span className="toggle-desc">Receive browser sound or alert when AI finishes long responses.</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.notifications_enabled}
                    onChange={(e) => handleUpdateSetting('notifications_enabled', e.target.checked)}
                  />
                  <span className="toggle-slider round" />
                </label>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Chat Display Density</span>
                  <span className="toggle-desc">Choose between standard comfortable spacing or compact message layout.</span>
                </div>
                <select
                  value={settings.display_mode}
                  onChange={(e) => handleUpdateSetting('display_mode', e.target.value)}
                  className="setting-select"
                >
                  <option value="comfortable">Comfortable Spacing</option>
                  <option value="compact">Compact View</option>
                </select>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION C: PRIVACY                                             */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <h3 className="settings-card-title">C. Privacy</h3>
            <p className="settings-card-desc">Control what Personal AI remembers and manages in your private environment.</p>

            <div className="settings-rows-list">
              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Personal Memory Engine</span>
                  <span className="toggle-desc">Allow Personal AI to reference past context and stored facts during chats.</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.memory_enabled}
                    onChange={(e) => handleUpdateSetting('memory_enabled', e.target.checked)}
                  />
                  <span className="toggle-slider round" />
                </label>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Document Privacy Isolation</span>
                  <span className="toggle-desc">All uploaded documents and extracted texts are strictly scoped to your User ID and never shared across users.</span>
                </div>
                <span className="setting-status-badge">Strict Isolation Active</span>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION D: SECURITY                                            */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <h3 className="settings-card-title">D. Security</h3>
            <p className="settings-card-desc">Authentication provider status and active session credentials.</p>

            <div className="settings-rows-list">
              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Identity Provider</span>
                  <span className="toggle-desc">Authenticated securely using Google OAuth 2.0 with JWT access token protection.</span>
                </div>
                <span className="tag-pill provider">
                  <Shield size={14} color="#10b981" />
                  <span>Google Account ({user?.email})</span>
                </span>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Active Session</span>
                  <span className="toggle-desc">SimpleJWT Refresh Token rotation verified.</span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="btn-danger-outline"
                >
                  <LogOut size={15} />
                  <span>Log out of Session</span>
                </button>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION E: DATA MANAGEMENT                                     */}
          {/* ============================================================== */}
          <div className="settings-body-card destructive-card">
            <h3 className="settings-card-title danger-title">E. Data Management</h3>
            <p className="settings-card-desc">Export your personal data or perform irreversible account cleanup operations.</p>

            <div className="settings-rows-list">
              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Export All Personal Data</span>
                  <span className="toggle-desc">Download a complete structured JSON copy of your profile, preferences, memories, documents list, and chat logs.</span>
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className="btn-action secondary"
                >
                  {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>{exporting ? 'Preparing Export...' : 'Export JSON Data'}</span>
                </button>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Clear Conversation History</span>
                  <span className="toggle-desc">Delete all past chats and messages while keeping your uploaded documents and profile.</span>
                </div>
                <button
                  type="button"
                  onClick={() => openConfirm('history')}
                  className="btn-danger-outline"
                >
                  <Trash2 size={15} />
                  <span>Clear History</span>
                </button>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Delete Uploaded Documents</span>
                  <span className="toggle-desc">Permanently remove all uploaded PDF, DOCX, TXT, and MD files and their extracted contents.</span>
                </div>
                <button
                  type="button"
                  onClick={() => openConfirm('documents')}
                  className="btn-danger-outline"
                >
                  <Trash2 size={15} />
                  <span>Delete Documents</span>
                </button>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title danger-text">Delete Account</span>
                  <span className="toggle-desc">Permanently destroy your Personal AI account and all associated data. This action is irreversible.</span>
                </div>
                <button
                  type="button"
                  onClick={() => openConfirm('account')}
                  className="btn-destructive-solid"
                >
                  <Trash2 size={15} />
                  <span>Delete Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DESTRUCTIVE CONFIRMATION MODAL                                 */}
      {/* ============================================================== */}
      {confirmModal.isOpen && (
        <div className="modal-backdrop" onClick={() => !actionLoading && setConfirmModal({ ...confirmModal, isOpen: false })}>
          <div className="modal-card destructive-modal" onClick={(e) => e.stopPropagation()}>
            <div className="destructive-modal-header">
              <div className="warning-icon-box">
                <AlertTriangle size={24} color="#ef4444" />
              </div>
              <div>
                <h3>{confirmModal.title}</h3>
                <p>{confirmModal.message}</p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteDestructiveAction}
                className="btn-destructive-solid"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                <span>{confirmModal.confirmText}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
