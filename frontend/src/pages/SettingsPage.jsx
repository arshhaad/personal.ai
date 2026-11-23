import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import { googleDriveService } from '../services/googleDriveService';
import ConnectGoogleDriveModal from '../components/drive/ConnectGoogleDriveModal';
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
  ExternalLink,
  FileText,
  RefreshCw,
  FolderCheck,
} from 'lucide-react';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, refreshUserData } = useAuth();
  const { theme, setTheme: setAppTheme } = useTheme();
  const { showToast } = useToast();

  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

  const [settings, setSettings] = useState({
    theme: 'dark',
    enter_to_send: true,
    notifications_enabled: false,
    display_mode: 'comfortable',
    memory_enabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // App Uploaded Documents & Drive Folder Sync State
  const [appDocs, setAppDocs] = useState([]);
  const [appDocsMeta, setAppDocsMeta] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [deletingDocId, setDeletingDocId] = useState(null);

  // Destructive Modals State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null, // 'history', 'documents', 'account', 'app_documents'
    title: '',
    message: '',
    confirmText: '',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const showNotification = useCallback((msg, isError = false) => {
    showToast(msg, isError ? 'error' : 'success', 3000);
  }, [showToast]);

  const loadAppDocuments = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoadingDocs(true);
    }
    try {
      const data = await googleDriveService.getAppUploadedDocuments();
      setAppDocs(data.documents || []);
      setAppDocsMeta(data);
    } catch (err) {
      console.error('Failed to load app documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

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

    googleDriveService.getAppUploadedDocuments()
      .then((data) => {
        if (isMounted) {
          setAppDocs(data.documents || []);
          setAppDocsMeta(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load app documents:', err);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingDocs(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [setAppTheme, showNotification]);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDeleteIndividualDoc = async (doc) => {
    if (!window.confirm(`Are you sure you want to delete "${doc.original_name}"? This will remove it from the app knowledge base and your Google Drive folder.`)) {
      return;
    }
    setDeletingDocId(doc.id);
    try {
      const res = await googleDriveService.deleteAppUploadedDocument(doc.id);
      showNotification(res.message || 'Document deleted.');
      setAppDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setAppDocsMeta((prev) => prev ? {
        ...prev,
        total_count: Math.max(0, prev.total_count - 1),
        synced_drive_count: doc.drive_file_id
          ? Math.max(0, prev.synced_drive_count - 1)
          : prev.synced_drive_count,
      } : prev);
    } catch (err) {
      console.error('Failed to delete doc:', err);
      showNotification('Failed to delete document.', true);
    } finally {
      setDeletingDocId(null);
    }
  };

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
    } else if (type === 'documents' || type === 'app_documents') {
      setConfirmModal({
        isOpen: true,
        type: 'app_documents',
        title: 'Clear All App Uploaded Documents',
        message: 'This will permanently delete all documents uploaded using this application from your knowledge base and remove them from your Google Drive folder. No other files in your Google Drive will be touched.',
        confirmText: 'Clear App Documents',
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
      } else if (confirmModal.type === 'documents' || confirmModal.type === 'app_documents') {
        const res = await googleDriveService.clearAppUploadedDocuments();
        showNotification(res.message || 'App uploaded documents cleared.');
        setAppDocs([]);
        setAppDocsMeta((prev) => prev ? { ...prev, total_count: 0, synced_drive_count: 0 } : prev);
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

  const handleDisconnectDrive = async () => {
    if (!window.confirm('Disconnect Google Drive from Personal AI?')) return;
    setDisconnectingDrive(true);
    try {
      await googleDriveService.disconnect();
      await refreshUserData();
      showToast('Google Drive disconnected.', 'success', 3000);
    } catch {
      showToast('Failed to disconnect Google Drive.', 'error', 3000);
    } finally {
      setDisconnectingDrive(false);
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
                  <span className="toggle-title">Step 1: Google Identity</span>
                  <span className="toggle-desc">Google verified identity and linked application account.</span>
                </div>
                <span className="tag-pill provider">
                  <Shield size={14} color="#10b981" />
                  <span>Google Account ({user?.email})</span>
                </span>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Step 2: Google Drive Connection</span>
                  <span className="toggle-desc">&ldquo;Allow Personal Assistant AI to create and manage files that you select or create with this application.&rdquo;</span>
                </div>
                <div className="setting-action-controls">
                  {user?.google_drive?.is_connected ? (
                    <div className="drive-connected-group">
                      <span className="tag-pill provider">
                        <Shield size={14} color="#10b981" />
                        <span>Connected ({user?.google_drive?.drive_email || user?.email})</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleDisconnectDrive}
                        className="btn-danger-outline btn-sm"
                        disabled={disconnectingDrive}
                      >
                        {disconnectingDrive ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsDriveModalOpen(true)}
                      className="btn-primary-action btn-sm"
                    >
                      Connect Google Drive
                    </button>
                  )}
                </div>
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
          {/* SECTION E: APP UPLOADED DOCUMENTS & GOOGLE DRIVE STORAGE        */}
          {/* ============================================================== */}
          <div className="settings-body-card app-docs-settings-card">
            <div className="settings-card-header-flex">
              <div>
                <h3 className="settings-card-title">E. App Uploaded Documents</h3>
                <p className="settings-card-desc">
                  Documents uploaded using this web application are organized and stored directly in your own Google Drive folder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadAppDocuments(true)}
                className="btn-refresh-docs"
                title="Refresh documents list"
                disabled={loadingDocs}
              >
                <RefreshCw size={15} className={loadingDocs ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Storage Folder Info Banner */}
            <div className="drive-folder-banner">
              <div className="folder-banner-left">
                <div className="folder-icon-circle">
                  <FolderCheck size={20} />
                </div>
                <div className="folder-banner-text">
                  <span className="folder-banner-title">
                    Dedicated Folder: <strong>{appDocsMeta?.drive_folder_name || 'Personal AI Documents'}</strong>
                  </span>
                  <span className="folder-banner-sub">
                    {user?.google_drive?.is_connected
                      ? `Sync Active (${appDocsMeta?.synced_drive_count || 0} of ${appDocs.length} files stored in your Google Drive)`
                      : 'Google Drive not connected. Connect Google Drive to automatically store uploaded files directly in your Drive.'}
                  </span>
                </div>
              </div>
              <div className="folder-banner-right">
                {user?.google_drive?.is_connected ? (
                  <span className="drive-connected-pill">
                    <Shield size={13} color="#10b981" />
                    <span>Drive Connected</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsDriveModalOpen(true)}
                    className="btn-connect-drive-sm"
                  >
                    Connect Drive
                  </button>
                )}
              </div>
            </div>

            {/* Uploaded Documents List */}
            <div className="app-docs-list-wrapper">
              {loadingDocs ? (
                <div className="app-docs-loading">
                  <Loader2 size={22} className="animate-spin" />
                  <span>Loading uploaded documents...</span>
                </div>
              ) : appDocs.length === 0 ? (
                <div className="app-docs-empty-state">
                  <FileText size={32} className="empty-docs-icon" />
                  <h4>No documents uploaded yet</h4>
                  <p>
                    When you upload documents via Chat or Personalization, they are automatically stored in your Google Drive folder and listed here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="app-docs-items-list">
                    {appDocs.map((doc) => (
                      <div key={doc.id} className="app-doc-row">
                        <div className="doc-item-icon">
                          <FileText size={18} />
                        </div>
                        <div className="doc-item-details">
                          <span className="doc-item-name" title={doc.original_name}>
                            {doc.original_name}
                          </span>
                          <div className="doc-item-meta">
                            <span className="doc-badge-type">{doc.file_type?.toUpperCase()}</span>
                            <span>•</span>
                            <span>{formatBytes(doc.file_size)}</span>
                            <span>•</span>
                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                            {doc.drive_file_id ? (
                              <span className="badge-drive-synced" title="Stored in user's Google Drive folder">
                                In Google Drive
                              </span>
                            ) : (
                              <span className="badge-local-only" title="Stored locally in knowledge base">
                                Local Only
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="doc-item-actions">
                          {doc.drive_web_link && (
                            <a
                              href={doc.drive_web_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-doc-action view-drive"
                              title="Open file in Google Drive"
                            >
                              <ExternalLink size={14} />
                              <span>Drive</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteIndividualDoc(doc)}
                            disabled={deletingDocId === doc.id}
                            className="btn-doc-action delete"
                            title="Delete document and remove from Google Drive"
                          >
                            {deletingDocId === doc.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Clear App Documents Action Bar */}
                  <div className="app-docs-footer-bar">
                    <span className="app-docs-count-text">
                      Showing {appDocs.length} document{appDocs.length === 1 ? '' : 's'} uploaded via this application
                    </span>
                    <button
                      type="button"
                      onClick={() => openConfirm('app_documents')}
                      className="btn-clear-app-docs"
                    >
                      <Trash2 size={14} />
                      <span>Clear Uploaded Documents</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION F: DATA MANAGEMENT                                     */}
          {/* ============================================================== */}
          <div className="settings-body-card destructive-card">
            <h3 className="settings-card-title danger-title">F. Data Management</h3>
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
      {/* Step 2: Connect Google Drive Modal */}
      <ConnectGoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
      />
    </div>
  );
}
