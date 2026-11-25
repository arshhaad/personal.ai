import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/useToast';
import { reminderService } from '../services/reminderService';
import { triggerDesktopNotification } from '../utils/desktopNotification';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  subscribeNotificationSoundChange,
  playNotificationChord,
} from '../utils/notificationSound';
import {
  getDetectedTimezone,
  getPreferredTimezone,
  subscribeTimezoneChange,
} from '../utils/timezoneUtils';
import WorkspaceSidebarLayout from '../components/layout/WorkspaceSidebarLayout';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  AlarmClock,
  Plus,
  Clock,
  Repeat,
  Check,
  Trash2,
  Edit2,
  History,
  Loader2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const SNOOZE_MINUTES = [5, 10, 30];

function formatUtcIsoForTimezoneInput(isoString, tzName) {
  try {
    const dt = new Date(isoString);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tzName || getDetectedTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dt);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
  } catch {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    nextHour.setSeconds(0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${nextHour.getFullYear()}-${pad(nextHour.getMonth() + 1)}-${pad(nextHour.getDate())}T${pad(nextHour.getHours())}:${pad(nextHour.getMinutes())}`;
  }
}

export default function RemindersPage() {
  const { showToast } = useToast();
  const detectedTz = getDetectedTimezone();
  const [selectedTimezone, setSelectedTimezone] = useState(() => getPreferredTimezone());
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());

  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);
  const [history, setHistory] = useState([]);
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  // Create / Edit Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(() => ({
    title: '',
    message: '',
    scheduled_at: formatUtcIsoForTimezoneInput(
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      selectedTimezone
    ),
    recurrence: 'none',
    timezone_name: selectedTimezone,
  }));
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Action busy states
  const [busyId, setBusyId] = useState(null);
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Delete',
    action: null,
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const notifySidebarCount = () => {
    window.dispatchEvent(new Event('reminders-updated'));
  };

  const loadReminders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await reminderService.getReminders();
      setUpcoming(data.upcoming || []);
      setHistory(data.history || []);

      if (Array.isArray(data.newly_triggered) && data.newly_triggered.length > 0) {
        data.newly_triggered.forEach((rem) => {
          triggerDesktopNotification(
            `Reminder: ${rem.title}`,
            rem.message || rem.display_schedule || 'Scheduled reminder is due.',
            { tag: `reminder-${rem.id}`, url: '/reminders' }
          );
        });
      }
      window.dispatchEvent(new Event('reminders-updated'));
    } catch {
      if (!silent) showToast('Failed to load reminders.', 'error', 3000);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let isMounted = true;
    reminderService.getReminders()
      .then((data) => {
        if (!isMounted) return;
        setUpcoming(data.upcoming || []);
        setHistory(data.history || []);
      })
      .catch(() => {
        if (isMounted) showToast('Failed to load reminders.', 'error', 3000);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const handleRefresh = () => {
      reminderService.getReminders()
        .then((data) => {
          if (!isMounted) return;
          setUpcoming(data.upcoming || []);
          setHistory(data.history || []);
        })
        .catch(() => {});
    };
    window.addEventListener('reminders-updated', handleRefresh);

    const interval = setInterval(() => {
      loadReminders(true);
    }, 30000);

    return () => {
      isMounted = false;
      window.removeEventListener('reminders-updated', handleRefresh);
      clearInterval(interval);
    };
  }, [loadReminders, showToast]);

  // Close modal on Escape key
  useEffect(() => {
    if (!showForm) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        setShowForm(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showForm, saving]);

  useEffect(() => {
    const unsubSound = subscribeNotificationSoundChange((enabled) => {
      setSoundEnabled(enabled);
    });
    const unsubTz = subscribeTimezoneChange((tz) => {
      if (tz) setSelectedTimezone(tz);
    });
    return () => {
      unsubSound();
      unsubTz();
    };
  }, []);

  const handleToggleSound = () => {
    const next = setNotificationSoundEnabled(!soundEnabled);
    setSoundEnabled(next);
    if (next) {
      playNotificationChord({ force: true });
      showToast('Reminder sound enabled.', 'info', 2000);
    } else {
      showToast('Reminder sound muted.', 'info', 2000);
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setFormData({
      title: '',
      message: '',
      scheduled_at: formatUtcIsoForTimezoneInput(
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        selectedTimezone
      ),
      recurrence: 'none',
      timezone_name: selectedTimezone,
    });
    setFormErrors({});
    setShowForm(true);
  };

  const openEditForm = (rem) => {
    setEditingId(rem.id);
    setFormData({
      title: rem.title,
      message: rem.message || '',
      scheduled_at: formatUtcIsoForTimezoneInput(rem.scheduled_at, rem.timezone_name),
      recurrence: rem.recurrence || 'none',
      timezone_name: rem.timezone_name || detectedTz,
    });
    setFormErrors({});
    setShowForm(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.title.trim()) {
      errors.title = 'Reminder title is required.';
    } else if (formData.title.trim().length > 200) {
      errors.title = 'Title cannot exceed 200 characters.';
    }
    if (!formData.scheduled_at) {
      errors.scheduled_at = 'Date and time are required.';
    }
    if (!formData.timezone_name) {
      errors.timezone_name = 'Time zone is required.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveReminder = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        // Send exact naive wall-clock date/time paired with user's selected IANA timezone
        // so the backend resolves timezone rules cleanly even if TZ differs from browser OS TZ
        scheduled_at: formData.scheduled_at,
        timezone_name: formData.timezone_name,
        recurrence: formData.recurrence,
      };

      if (editingId) {
        await reminderService.updateReminder(editingId, payload);
        showToast('Reminder updated!', 'success', 2500);
      } else {
        await reminderService.createReminder(payload);
        showToast('Reminder scheduled!', 'success', 2500);
      }

      if (notifPermission === 'default' && 'Notification' in window) {
        Notification.requestPermission()
          .then((perm) => setNotifPermission(perm))
          .catch(() => {});
      }

      setShowForm(false);
      setEditingId(null);
      await loadReminders(true);
      notifySidebarCount();
    } catch (err) {
      const data = err.response?.data;
      if (data?.scheduled_at) {
        setFormErrors((prev) => ({
          ...prev,
          scheduled_at: Array.isArray(data.scheduled_at) ? data.scheduled_at[0] : data.scheduled_at,
        }));
      } else {
        showToast(data?.error || 'Could not save reminder.', 'error', 3500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (rem) => {
    setBusyId(rem.id);
    try {
      const res = await reminderService.completeReminder(rem.id);
      showToast(res.message || 'Marked as done.', 'success', 3000);
      await loadReminders(true);
      notifySidebarCount();
    } catch {
      showToast('Failed to complete reminder.', 'error', 3000);
    } finally {
      setBusyId(null);
    }
  };

  const handleSnooze = async (rem, minutes) => {
    setBusyId(rem.id);
    try {
      const res = await reminderService.snoozeReminder(rem.id, minutes);
      showToast(res.message || `Snoozed for ${minutes} minutes.`, 'info', 2500);
      await loadReminders(true);
      notifySidebarCount();
    } catch {
      showToast('Failed to snooze reminder.', 'error', 3000);
    } finally {
      setBusyId(null);
    }
  };

  const requestDeleteReminder = (rem) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Reminder',
      message: `Delete reminder "${rem.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      action: async () => {
        await reminderService.deleteReminder(rem.id);
        showToast('Reminder deleted.', 'info', 2500);
        await loadReminders(true);
        notifySidebarCount();
      },
    });
  };

  const requestClearHistory = () => {
    setConfirmState({
      isOpen: true,
      title: 'Clear Reminder History',
      message: 'Remove all past reminder history records?',
      confirmText: 'Clear History',
      action: async () => {
        await reminderService.clearHistory();
        setHistory([]);
        showToast('Reminder history cleared.', 'info', 2500);
      },
    });
  };

  const handleConfirmExecute = async () => {
    if (!confirmState.action) return;
    setConfirmLoading(true);
    try {
      await confirmState.action();
      setConfirmState((p) => ({ ...p, isOpen: false }));
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <WorkspaceSidebarLayout title="Reminders" reminderCountOverride={upcoming.length}>
      <div className="page-container reminders-page-container">
        <div className="page-header reminders-header">
          <div>
            <h1>Reminders</h1>
            <p className="subtitle">
              Schedule one-time or recurring alerts with in-app and browser notifications in your local time zone.
            </p>
          </div>

          <div className="reminders-header-actions">
            <button
              type="button"
              onClick={handleToggleSound}
              className={`btn-reminder-sound-toggle ${soundEnabled ? 'sound-on' : 'sound-muted'}`}
              title={soundEnabled ? 'Sound On (click to mute)' : 'Sound Muted (click to turn on)'}
              aria-label={soundEnabled ? 'Mute reminder sound' : 'Unmute reminder sound'}
              aria-pressed={!soundEnabled}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            <button type="button" onClick={openCreateForm} className="btn-primary btn-new-reminder">
              <Plus size={16} />
              <span>New Reminder</span>
            </button>
          </div>
        </div>

        {/* Upcoming / History Tabs */}
        <div className="integrations-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upcoming'}
            onClick={() => setActiveTab('upcoming')}
            className={`integrations-tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
          >
            <AlarmClock size={16} />
            <span>Upcoming Reminders ({upcoming.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`integrations-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          >
            <History size={16} />
            <span>Reminder History ({history.length})</span>
          </button>
        </div>

        {loading ? (
          <div className="loading-center">
            <Loader2 size={28} className="animate-spin" />
            <p>Loading reminders...</p>
          </div>
        ) : activeTab === 'upcoming' ? (
          <section className="card reminder-list-shell">
            <div className="reminder-section-summary">
              <div>
                <h2>Upcoming Reminders</h2>
                <span className="reminder-upcoming-count">
                  {upcoming.length} upcoming
                </span>
              </div>
            </div>

            {upcoming.length === 0 ? (
              <div className="subpanel-empty reminder-empty-hero">
                <div className="reminder-empty-icon-wrap">
                  <AlarmClock size={26} />
                </div>
                <h3>No upcoming reminders</h3>
                <span>Stay on top of meetings, tasks, and daily habits with scheduled alerts.</span>
                <button type="button" onClick={openCreateForm} className="btn-primary">
                  <Plus size={15} />
                  <span>Create Reminder</span>
                </button>
              </div>
            ) : (
              <div className="reminders-cards-grid">
                {upcoming.map((rem) => {
                  const isBusy = busyId === rem.id;
                  return (
                    <div key={rem.id} className={`reminder-card ${rem.is_due ? 'due-now' : ''}`}>
                      <div className="reminder-card-main">
                        <div className="reminder-card-title-row">
                          <h3>{rem.title}</h3>
                          <div className="reminder-badges-row">
                            {rem.is_due && <span className="reminder-due-badge">Due Now</span>}
                            {rem.recurrence !== 'none' && (
                              <span className="reminder-recur-badge">
                                <Repeat size={11} /> {rem.recurrence_display}
                              </span>
                            )}
                          </div>
                        </div>

                        {rem.message && <p className="reminder-card-msg">{rem.message}</p>}

                        <div className="reminder-card-time-row">
                          <Clock size={13} />
                          <strong>{rem.display_schedule}</strong>
                          <span className="reminder-tz-sub">({rem.timezone_name})</span>
                        </div>
                      </div>

                      <div className="reminder-card-actions">
                        <button
                          type="button"
                          onClick={() => handleComplete(rem)}
                          disabled={isBusy}
                          className="btn-reminder-done"
                          title="Mark as done"
                        >
                          {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>Done</span>
                        </button>

                        <div className="snooze-pill-group" title="Snooze reminder">
                          {SNOOZE_MINUTES.map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => handleSnooze(rem, mins)}
                              disabled={isBusy}
                              className="btn-snooze-chip"
                            >
                              +{mins}m
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => openEditForm(rem)}
                          disabled={isBusy}
                          className="btn-icon-sm"
                          title="Edit reminder"
                        >
                          <Edit2 size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => requestDeleteReminder(rem)}
                          disabled={isBusy}
                          className="btn-icon-danger"
                          title="Delete reminder"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="card reminder-list-shell">
            <div className="reminder-section-summary">
              <div>
                <h2>Reminder History</h2>
                <span className="reminder-upcoming-count">
                  {history.length} past event(s)
                </span>
              </div>
              {history.length > 0 && (
                <button type="button" onClick={requestClearHistory} className="btn-secondary btn-sm">
                  Clear History
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="subpanel-empty">
                <History size={28} />
                <span>No past reminders yet. Completed, snoozed, and triggered reminders appear here.</span>
              </div>
            ) : (
              <div className="integration-list">
                {history.map((item) => (
                  <div key={item.id} className="integration-list-item reminder-history-item">
                    <div className="item-main">
                      <div className="item-title-row">
                        <strong>{item.title}</strong>
                        <span className={`history-event-badge ${item.event_type}`}>
                          {item.event_type}
                        </span>
                        {item.recurrence !== 'none' && (
                          <span className="reminder-recur-badge">
                            <Repeat size={11} /> {item.recurrence}
                          </span>
                        )}
                      </div>
                      {item.message && <p className="item-snippet">{item.message}</p>}
                      <div className="item-meta">
                        <span>Scheduled: {item.display_schedule} ({item.timezone_name})</span>
                        <span>Recorded: {new Date(item.recorded_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Create / Edit Reminder Popup Modal */}
      {showForm && createPortal(
        <div
          className="modal-backdrop reminder-modal-backdrop"
          onClick={() => !saving && setShowForm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminder-modal-title"
        >
          <form
            onSubmit={handleSaveReminder}
            onClick={(e) => e.stopPropagation()}
            className="reminder-modal-card"
            noValidate
          >
            <div className="reminder-modal-header">
              <div className="reminder-modal-title-wrap">
                <div className="reminder-modal-icon">
                  <AlarmClock size={18} />
                </div>
                <div>
                  <h2 id="reminder-modal-title">{editingId ? 'Edit Reminder' : 'Create Reminder'}</h2>
                  <p>Schedule an alert in your local time zone.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !saving && setShowForm(false)}
                className="btn-modal-close-x"
                aria-label="Close modal"
              >
                <X size={17} />
              </button>
            </div>

            <div className="reminder-modal-body">
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="rem-title" className="form-label">Title *</label>
                  <input
                    id="rem-title"
                    type="text"
                    className="styled-field"
                    value={formData.title}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, title: e.target.value }));
                      if (formErrors.title) setFormErrors((er) => ({ ...er, title: '' }));
                    }}
                    placeholder="e.g., Attend project meeting"
                    maxLength={200}
                    autoFocus
                  />
                  {formErrors.title && <span className="field-error-text">{formErrors.title}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="rem-recurrence" className="form-label">Repeat</label>
                  <select
                    id="rem-recurrence"
                    className="styled-field"
                    value={formData.recurrence}
                    onChange={(e) => setFormData((p) => ({ ...p, recurrence: e.target.value }))}
                  >
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="rem-datetime" className="form-label">Date &amp; Time *</label>
                <input
                  id="rem-datetime"
                  type="datetime-local"
                  className="styled-field"
                  value={formData.scheduled_at}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, scheduled_at: e.target.value }));
                    if (formErrors.scheduled_at) setFormErrors((er) => ({ ...er, scheduled_at: '' }));
                  }}
                />
                {formErrors.scheduled_at && <span className="field-error-text">{formErrors.scheduled_at}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="rem-message" className="form-label">Message / Notes (Optional)</label>
                <textarea
                  id="rem-message"
                  rows={3}
                  className="styled-field styled-textarea"
                  value={formData.message}
                  onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Additional details shown in the notification..."
                />
              </div>
            </div>

            <div className="reminder-modal-footer">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <AlarmClock size={15} />}
                <span>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Reminder'}</span>
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        loading={confirmLoading}
        onConfirm={handleConfirmExecute}
        onCancel={() => setConfirmState((p) => ({ ...p, isOpen: false }))}
      />
    </WorkspaceSidebarLayout>
  );
}
