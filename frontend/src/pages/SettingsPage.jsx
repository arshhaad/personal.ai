import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import { googleDriveService } from '../services/googleDriveService';
import ConnectGoogleDriveModal from '../components/drive/ConnectGoogleDriveModal';
import ConfirmModal from '../components/common/ConfirmModal';
import WorkspaceSidebarLayout from '../components/layout/WorkspaceSidebarLayout';
import InstallButton from '../components/pwa/InstallButton';
import { requestBrowserNotificationPermission, triggerDesktopNotification } from '../utils/desktopNotification';
import {
  NOTIFICATION_SOUNDS,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  getNotificationSoundPreset,
  setNotificationSoundPreset,
  getNotificationSoundVolume,
  setNotificationSoundVolume,
  subscribeNotificationSoundChange,
  playNotificationChord,
} from '../utils/notificationSound';
import {
  getAllTimezones,
  getDetectedTimezone,
  getPreferredTimezone,
  setPreferredTimezone,
  subscribeTimezoneChange,
} from '../utils/timezoneUtils';
import {
  Sun,
  Moon,
  Laptop,
  Shield,
  Trash2,
  Loader2,
  ExternalLink,
  FileText,
  RefreshCw,
  FolderCheck,
  Volume1,
  Volume2,
  VolumeX,
  Bell,
  Music2,
  Globe,
  Play,
  Check,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme: setAppTheme } = useTheme();
  const { showToast } = useToast();

  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  const [settings, setSettings] = useState({
    theme: 'dark',
    enter_to_send: true,
    notifications_enabled: false,
  });

  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());
  const [soundPreset, setSoundPreset] = useState(() => getNotificationSoundPreset());
  const [soundVolume, setSoundVolume] = useState(() => Math.round(getNotificationSoundVolume() * 100));
  const detectedTimezone = getDetectedTimezone();
  const timezoneChoices = getAllTimezones(detectedTimezone);
  const [selectedTimezone, setSelectedTimezone] = useState(() => getPreferredTimezone());
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

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

  useEffect(() => {
    const unsubSound = subscribeNotificationSoundChange((enabled, preset, volume) => {
      setSoundEnabled(enabled);
      if (preset) setSoundPreset(preset);
      if (typeof volume === 'number') setSoundVolume(Math.round(volume * 100));
    });
    const unsubTz = subscribeTimezoneChange((tz) => {
      if (tz) setSelectedTimezone(tz);
    });
    return () => {
      unsubSound();
      unsubTz();
    };
  }, []);

  const handleVolumeChange = (percent) => {
    const clamped = Math.min(100, Math.max(0, Number(percent) || 0));
    setSoundVolume(clamped);
    setNotificationSoundVolume(clamped / 100);
  };

  const handleVolumePreview = () => {
    if (soundEnabled && soundVolume > 0) {
      playNotificationChord({ force: true, preset: soundPreset, volume: soundVolume / 100 });
    }
  };

  const handleToggleNotificationSound = (checked) => {
    const next = setNotificationSoundEnabled(checked);
    setSoundEnabled(next);
    if (next) {
      playNotificationChord({ force: true, preset: soundPreset });
      showNotification('Reminder & notification sound enabled.');
    } else {
      showNotification('Reminder & notification sound muted.');
    }
  };

  const handleSelectSoundPreset = async (presetId) => {
    setNotificationSoundPreset(presetId);
    setSoundPreset(presetId);
    await playNotificationChord({ force: true, preset: presetId });
    const chosen = NOTIFICATION_SOUNDS.find((s) => s.id === presetId);
    if (chosen) {
      showToast(`Selected "${chosen.name}" reminder sound.`, 'info', 2000);
    }
  };

  const handleTimezoneChange = (nextTz) => {
    setSelectedTimezone(nextTz);
    setPreferredTimezone(nextTz);
    showNotification(`Time zone updated to ${nextTz}.`);
  };

  const handleTestChordSound = async () => {
    const played = await playNotificationChord({ force: true, preset: soundPreset });
    if (played) {
      const chosen = NOTIFICATION_SOUNDS.find((s) => s.id === soundPreset);
      showToast(`Playing "${chosen?.name || 'Chord'}" sound.`, 'info', 2000);
    } else {
      showNotification('Audio playback was blocked by the browser. Tap again to enable.', true);
    }
  };

  const handleEnableBrowserAlerts = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      showToast('Web App notifications enabled!', 'success', 3000);
      triggerDesktopNotification(
        'Web App Notifications Active',
        'You will hear the chord chime and receive alerts for reminders and updates.'
      );
    } else if (perm === 'denied') {
      showToast('Browser notifications are blocked in site settings.', 'error', 3500);
    } else if (perm === 'unsupported') {
      showToast('Browser notifications are not supported on this device.', 'error', 3000);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDeleteIndividualDoc = (doc) => {
    setConfirmModal({
      isOpen: true,
      type: 'single_app_doc',
      payload: doc,
      variant: 'danger',
      title: 'Delete Uploaded Document',
      message: `Are you sure you want to delete "${doc.original_name}"? This will permanently remove it from your knowledge base and your Google Drive folder.`,
      confirmText: 'Delete Document',
    });
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

  // Open confirmation modal for destructive operations
  const openConfirm = (type) => {
    if (type === 'history') {
      setConfirmModal({
        isOpen: true,
        type: 'history',
        variant: 'danger',
        title: 'Clear Conversation History',
        message: 'Are you sure you want to delete all your conversations? This action cannot be undone.',
        confirmText: 'Clear All Chats',
      });
    } else if (type === 'documents' || type === 'app_documents') {
      setConfirmModal({
        isOpen: true,
        type: 'app_documents',
        variant: 'danger',
        title: 'Clear All App Uploaded Documents',
        message: 'This will permanently delete all documents uploaded using this application from your knowledge base and remove them from your Google Drive folder. No other files in your Google Drive will be touched.',
        confirmText: 'Clear App Documents',
      });
    } else if (type === 'account') {
      setConfirmModal({
        isOpen: true,
        type: 'account',
        variant: 'danger',
        title: 'Delete Personal AI Account',
        message: 'Permanently deletes your account, personal preferences, memories, uploaded documents, and all chats. This action is irreversible.',
        confirmText: 'Permanently Delete My Account',
      });
    }
  };

  const handleExecuteDestructiveAction = async () => {
    setActionLoading(true);
    try {
      if (confirmModal.type === 'single_app_doc' && confirmModal.payload) {
        const doc = confirmModal.payload;
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
        } finally {
          setDeletingDocId(null);
        }
      } else if (confirmModal.type === 'history') {
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

  return (
    <WorkspaceSidebarLayout
      title="Settings"
      docCountOverride={loadingDocs ? undefined : appDocs.length}
    >
      <div className="settings-sections-wrapper">
        <div className="workspace-page-intro">
          <h1>Settings</h1>
          <p>Customize app appearance, chat preferences, uploaded documents, and data management.</p>
        </div>

        {loading ? (
          <div className="settings-loading-card">
            <Loader2 size={32} className="animate-spin" />
            <p>Loading application settings...</p>
          </div>
        ) : (
          <>
          {/* ============================================================== */}
          {/* SECTION A: REMINDER SOUNDS & TIME ZONE (FIRST SECTION)         */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <div className="settings-card-header-flex">
              <div>
                <h3 className="settings-card-title">A. Reminder Sounds &amp; Time Zone</h3>
                <p className="settings-card-desc">
                  Choose from 10 reminder &amp; notification sounds and set your preferred local time zone.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestChordSound}
                className="btn-secondary btn-sm"
                title="Preview selected reminder sound"
              >
                <Play size={14} />
                <span>Preview</span>
              </button>
            </div>

            <div className="settings-rows-list">
              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Reminder &amp; Notification Sound</span>
                  <span className="toggle-desc">
                    {soundEnabled
                      ? `Sound is active (${NOTIFICATION_SOUNDS.find((s) => s.id === soundPreset)?.name || 'Chord'}).`
                      : 'Sound is currently muted for reminders and notifications.'}
                  </span>
                </div>
                <div className="setting-inline-controls">
                  <span className={`sound-state-pill ${soundEnabled ? 'on' : 'muted'}`}>
                    {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(e) => handleToggleNotificationSound(e.target.checked)}
                    />
                    <span className="toggle-slider round" />
                  </label>
                </div>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Sound Volume</span>
                  <span className="toggle-desc">
                    Adjust volume level for reminder and notification chimes.
                  </span>
                </div>
                <div className="sound-volume-control">
                  <button
                    type="button"
                    onClick={() => {
                      const next = soundVolume > 0 ? 0 : 80;
                      handleVolumeChange(next);
                      if (next > 0 && soundEnabled) {
                        playNotificationChord({ force: true, preset: soundPreset, volume: next / 100 });
                      }
                    }}
                    className="btn-volume-icon"
                    title={soundVolume === 0 ? 'Restore volume to 80%' : 'Mute volume to 0%'}
                    aria-label={soundVolume === 0 ? 'Restore sound volume' : 'Mute sound volume'}
                  >
                    {soundVolume === 0 || !soundEnabled ? (
                      <VolumeX size={16} />
                    ) : soundVolume < 50 ? (
                      <Volume1 size={16} />
                    ) : (
                      <Volume2 size={16} />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={soundVolume}
                    onChange={(e) => handleVolumeChange(e.target.value)}
                    onMouseUp={handleVolumePreview}
                    onTouchEnd={handleVolumePreview}
                    onKeyUp={handleVolumePreview}
                    aria-label="Reminder sound volume"
                    className="sound-volume-slider"
                    disabled={!soundEnabled}
                  />
                  <span className="sound-volume-badge">{soundEnabled ? `${soundVolume}%` : 'Muted'}</span>
                </div>
              </div>

              <div className="setting-divider" />

              <div className="sound-presets-section">
                <div className="sound-presets-header">
                  <span className="toggle-title">Select Reminder Sound (10 Best Sounds)</span>
                  <span className="toggle-desc">Tap any sound below to preview and set it as your reminder chime.</span>
                </div>

                <div className="reminder-sounds-grid" role="radiogroup" aria-label="Reminder sounds">
                  {NOTIFICATION_SOUNDS.map((sound, idx) => {
                    const isSelected = soundPreset === sound.id;
                    return (
                      <button
                        key={sound.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleSelectSoundPreset(sound.id)}
                        className={`sound-preset-card ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="sound-preset-left">
                          <span className="sound-preset-num">{idx + 1}</span>
                          <div className="sound-preset-meta">
                            <span className="sound-preset-name">{sound.name}</span>
                            <span className="sound-preset-desc">{sound.description}</span>
                          </div>
                        </div>
                        <span className="sound-preset-action-icon" aria-hidden="true">
                          {isSelected ? <Check size={14} /> : <Music2 size={14} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="setting-divider" />

              <div className="setting-toggle-row">
                <div className="toggle-text-meta">
                  <span className="toggle-title">Reminder Time Zone</span>
                  <span className="toggle-desc">
                    Used when scheduling and displaying reminders (Device detected: {detectedTimezone}).
                  </span>
                </div>
                <label className="settings-tz-select-wrap" title="Select reminder time zone">
                  <Globe size={15} />
                  <select
                    aria-label="Reminder time zone"
                    value={selectedTimezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className="settings-tz-select"
                  >
                    {timezoneChoices.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION B: APPEARANCE                                          */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <h3 className="settings-card-title">B. Appearance</h3>
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
          {/* SECTION C: CHAT & NOTIFICATION PREFERENCES                     */}
          {/* ============================================================== */}
          <div className="settings-body-card">
            <h3 className="settings-card-title">C. Chat &amp; Notification Preferences</h3>
            <p className="settings-card-desc">Fine-tune message sending and Web App browser alerts.</p>

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
                  <span className="toggle-desc">Play your selected notification sound and show an alert when AI finishes responding.</span>
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
                  <span className="toggle-title">Web App &amp; Browser Alerts</span>
                  <span className="toggle-desc">
                    {notifPermission === 'granted'
                      ? 'Browser and installed Web App notifications are enabled.'
                      : notifPermission === 'denied'
                        ? 'Notifications are blocked in browser site settings. In-app sound alerts still play.'
                        : 'Allow native notifications for reminders and background alerts, or install as a Web App.'}
                  </span>
                </div>
                <div className="setting-inline-controls">
                  {notifPermission === 'granted' ? (
                    <span className="drive-connected-pill">
                      <Bell size={13} />
                      <span>Alerts On</span>
                    </span>
                  ) : notifPermission !== 'unsupported' ? (
                    <button
                      type="button"
                      onClick={handleEnableBrowserAlerts}
                      className="btn-secondary btn-sm"
                    >
                      <Volume2 size={14} />
                      <span>Enable Alerts</span>
                    </button>
                  ) : null}
                  <InstallButton variant="landing-small" label="Install Web App" />
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SECTION D: APP UPLOADED DOCUMENTS & GOOGLE DRIVE STORAGE        */}
          {/* ============================================================== */}
          <div className="settings-body-card app-docs-settings-card">
            <div className="settings-card-header-flex">
              <div>
                <h3 className="settings-card-title">D. App Uploaded Documents</h3>
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
          {/* SECTION E: DATA MANAGEMENT                                     */}
          {/* ============================================================== */}
          <div className="settings-body-card destructive-card">
            <h3 className="settings-card-title danger-title">E. Data Management</h3>
            <p className="settings-card-desc">Manage your conversation history, uploaded documents, or permanently delete your account.</p>

            <div className="settings-rows-list">
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
          </>
        )}
      </div>

      {/* ============================================================== */}
      {/* CONFIRMATION MODAL                                             */}
      {/* ============================================================== */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant || 'danger'}
        loading={actionLoading}
        onConfirm={handleExecuteDestructiveAction}
        onCancel={() => !actionLoading && setConfirmModal({ isOpen: false, type: null, title: '', message: '', confirmText: '' })}
      />
      {/* Step 2: Connect Google Drive Modal */}
      <ConnectGoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
      />
    </WorkspaceSidebarLayout>
  );
}
