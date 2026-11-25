import { useState, useEffect, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { integrationsService } from '../services/integrationsService';
import WorkspaceSidebarLayout from '../components/layout/WorkspaceSidebarLayout';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  subscribeNotificationSoundChange,
  playNotificationChord,
} from '../utils/notificationSound';
import {
  requestBrowserNotificationPermission,
  triggerDesktopNotification,
} from '../utils/desktopNotification';
import { updateAppNotificationBadge } from '../utils/appBadge';
import {
  Calendar,
  Mail,
  Bell,
  AlarmClock,
  FileText,
  Sparkles,
  CheckCircle2,
  CheckCheck,
  Check,
  Loader2,
  ExternalLink,
  RefreshCw,
  Plus,
  Trash2,
  Send,
  Search,
  AlertTriangle,
  Clock,
  MapPin,
  Volume2,
  VolumeX,
  Music2,
} from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INTEGRATION_TABS = [
  { id: 'calendar', label: 'Google Calendar', icon: Calendar },
  { id: 'gmail', label: 'Gmail', icon: Mail },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

function getDefaultEventRange() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const toLocalInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

export default function IntegrationsPage() {
  const { user, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('calendar');
  const [loadingInit, setLoadingInit] = useState(true);

  // Google Calendar state
  const [calendarStatus, setCalendarStatus] = useState({ is_connected: false, calendar_email: '' });
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarDays, setCalendarDays] = useState(14);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [workspaceConnecting, setWorkspaceConnecting] = useState(false);
  const [calendarApiError, setCalendarApiError] = useState(null);
  const defaultRange = getDefaultEventRange();
  const [eventForm, setEventForm] = useState({
    summary: '',
    start_time: defaultRange.start,
    end_time: defaultRange.end,
    location: '',
    description: '',
  });
  const [eventErrors, setEventErrors] = useState({});
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState(null);

  // Gmail state
  const [gmailStatus, setGmailStatus] = useState({ is_connected: false, gmail_address: '' });
  const [gmailMessages, setGmailMessages] = useState([]);
  const [gmailSearch, setGmailSearch] = useState('');
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailApiError, setGmailApiError] = useState(null);
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', body: '' });
  const [emailErrors, setEmailErrors] = useState({});
  const [sendingEmail, setSendingEmail] = useState(false);

  // Notifications state (All / Unread / Read)
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifFilter, setNotifFilter] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  useEffect(() => {
    return subscribeNotificationSoundChange((enabled) => {
      setSoundEnabled(enabled);
    });
  }, []);

  // Confirm modal state
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    action: null,
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const loadCalendarEvents = useCallback(async (days = 14) => {
    setCalendarLoading(true);
    setCalendarApiError(null);
    try {
      const data = await integrationsService.getCalendarEvents(days);
      setCalendarEvents(data.events || []);
    } catch (err) {
      const data = err.response?.data;
      if (data?.is_api_disabled) {
        setCalendarApiError(data);
      } else {
        showToast(data?.error || 'Failed to load calendar events.', 'error', 3500);
      }
    } finally {
      setCalendarLoading(false);
    }
  }, [showToast]);

  const loadGmailMessages = useCallback(async (query = '') => {
    setGmailLoading(true);
    setGmailApiError(null);
    try {
      const data = await integrationsService.getGmailMessages(query);
      setGmailMessages(data.messages || []);
    } catch (err) {
      const data = err.response?.data;
      if (data?.is_api_disabled) {
        setGmailApiError(data);
      } else {
        showToast(data?.error || 'Failed to load Gmail inbox.', 'error', 3500);
      }
    } finally {
      setGmailLoading(false);
    }
  }, [showToast]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await integrationsService.getNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // ignore non-fatal notification load error
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      integrationsService.getCalendarStatus(),
      integrationsService.getGmailStatus(),
      integrationsService.getNotifications(),
    ])
      .then(([cal, gmail, notifData]) => {
        if (!isMounted) return;
        setCalendarStatus(cal || { is_connected: false, calendar_email: '' });
        setGmailStatus(gmail || { is_connected: false, gmail_address: '' });
        setNotifications(notifData?.notifications || []);
        setUnreadCount(notifData?.unread_count || 0);

        if (cal?.is_connected) {
          integrationsService.getCalendarEvents(14)
            .then((ev) => {
              if (isMounted) setCalendarEvents(ev.events || []);
            })
            .catch((err) => {
              if (isMounted && err.response?.data?.is_api_disabled) {
                setCalendarApiError(err.response.data);
              }
            });
        }
        if (gmail?.is_connected) {
          integrationsService.getGmailMessages('')
            .then((gm) => {
              if (isMounted) setGmailMessages(gm.messages || []);
            })
            .catch((err) => {
              if (isMounted && err.response?.data?.is_api_disabled) {
                setGmailApiError(err.response.data);
              }
            });
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load integrations:', err);
          showToast('Failed to load integrations.', 'error', 3500);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingInit(false);
      });

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  // --- Single-Account Workspace OAuth Flow (Locked to Signed-In Google Account) ---
  const triggerWorkspaceConnect = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    flow: 'auth-code',
    hint: user?.email || undefined,
    select_account: false,
    include_granted_scopes: true,
    onSuccess: async (codeResponse) => {
      setWorkspaceConnecting(true);
      setCalendarApiError(null);
      setGmailApiError(null);
      try {
        const res = await integrationsService.connectWorkspace({
          code: codeResponse.code,
          redirect_uri: 'postmessage',
        });
        if (res.calendar) setCalendarStatus(res.calendar);
        if (res.gmail) setGmailStatus(res.gmail);
        await refreshUserData();
        showToast(
          `Synced Calendar & Mail for ${user?.email || 'your signed-in account'}!`,
          'success',
          3000
        );
        const loaders = [loadNotifications()];
        if (res.calendar?.is_connected) loaders.push(loadCalendarEvents(calendarDays));
        if (res.gmail?.is_connected) loaders.push(loadGmailMessages(gmailSearch));
        await Promise.all(loaders);
      } catch (err) {
        const data = err.response?.data;
        if (data?.is_api_disabled) {
          setCalendarApiError(data);
        }
        showToast(data?.error || 'Failed to sync Google Mail & Calendar.', 'error', 4000);
      } finally {
        setWorkspaceConnecting(false);
      }
    },
    onError: (err) => {
      showToast(err.error_description || 'Google authorization was cancelled.', 'error', 3500);
    },
  });

  // --- Calendar Handlers & Validation ---
  const validateEventForm = () => {
    const errors = {};
    if (!eventForm.summary.trim()) {
      errors.summary = 'Event title is required.';
    } else if (eventForm.summary.trim().length > 200) {
      errors.summary = 'Event title cannot exceed 200 characters.';
    }

    if (!eventForm.start_time) {
      errors.start_time = 'Start date and time are required.';
    }
    if (!eventForm.end_time) {
      errors.end_time = 'End date and time are required.';
    }
    if (eventForm.start_time && eventForm.end_time) {
      const s = new Date(eventForm.start_time);
      const e = new Date(eventForm.end_time);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        errors.end_time = 'Invalid date/time format.';
      } else if (e <= s) {
        errors.end_time = 'End time must be strictly after start time.';
      }
    }
    setEventErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!validateEventForm()) return;

    setCreatingEvent(true);
    try {
      const payload = {
        summary: eventForm.summary.trim(),
        start_time: new Date(eventForm.start_time).toISOString(),
        end_time: new Date(eventForm.end_time).toISOString(),
        location: eventForm.location.trim(),
        description: eventForm.description.trim(),
      };
      await integrationsService.createCalendarEvent(payload);
      showToast('Calendar event created!', 'success', 3000);
      const nextRange = getDefaultEventRange();
      setEventForm({
        summary: '',
        start_time: nextRange.start,
        end_time: nextRange.end,
        location: '',
        description: '',
      });
      setEventErrors({});
      await Promise.all([loadCalendarEvents(calendarDays), loadNotifications()]);
    } catch (err) {
      const data = err.response?.data;
      if (data?.is_api_disabled) {
        setCalendarApiError(data);
      }
      showToast(data?.error || data?.non_field_errors?.[0] || 'Failed to create event.', 'error', 4000);
    } finally {
      setCreatingEvent(false);
    }
  };

  const requestDeleteEvent = (ev) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Calendar Event',
      message: `Remove "${ev.summary || 'Untitled event'}" from your Google Calendar?`,
      confirmText: 'Delete Event',
      action: async () => {
        setDeletingEventId(ev.id);
        try {
          await integrationsService.deleteCalendarEvent(ev.id);
          setCalendarEvents((prev) => prev.filter((item) => item.id !== ev.id));
          showToast('Event deleted.', 'success', 2500);
        } catch (err) {
          showToast(err.response?.data?.error || 'Failed to delete event.', 'error', 3500);
        } finally {
          setDeletingEventId(null);
        }
      },
    });
  };

  // --- Gmail Handlers & Validation ---
  const validateEmailForm = () => {
    const errors = {};
    const to = emailForm.to.trim();
    if (!to) {
      errors.to = 'Recipient email address is required.';
    } else if (!EMAIL_REGEX.test(to)) {
      errors.to = 'Please enter a valid email address.';
    }
    if (!emailForm.subject.trim()) {
      errors.subject = 'Email subject cannot be empty.';
    }
    if (!emailForm.body.trim()) {
      errors.body = 'Message body cannot be empty.';
    }
    setEmailErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!validateEmailForm()) return;

    setSendingEmail(true);
    try {
      await integrationsService.sendGmailMessage({
        to: emailForm.to.trim(),
        subject: emailForm.subject.trim(),
        body: emailForm.body.trim(),
      });
      showToast(`Email sent to ${emailForm.to.trim()}!`, 'success', 3500);
      setEmailForm({ to: '', subject: '', body: '' });
      setEmailErrors({});
      await Promise.all([loadGmailMessages(gmailSearch), loadNotifications()]);
    } catch (err) {
      const data = err.response?.data;
      if (data?.is_api_disabled) {
        setGmailApiError(data);
      }
      showToast(data?.error || 'Failed to send email.', 'error', 4000);
    } finally {
      setSendingEmail(false);
    }
  };

  // --- Notification Read Handlers ---
  const handleMarkOneRead = async (notif) => {
    if (notif.is_read) return;
    try {
      await integrationsService.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => {
        const next = Math.max(0, c - 1);
        updateAppNotificationBadge(next);
        window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { unreadCount: next } }));
        return next;
      });
    } catch {
      showToast('Failed to mark notification as read.', 'error', 2500);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await integrationsService.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      updateAppNotificationBadge(0);
      window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { unreadCount: 0 } }));
      showToast('All notifications marked as read.', 'success', 2500);
    } catch {
      showToast('Failed to update notifications.', 'error', 2500);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'reminder':
        return <AlarmClock size={15} />;
      case 'calendar':
        return <Calendar size={15} />;
      case 'email':
        return <Mail size={15} />;
      case 'document':
        return <FileText size={15} />;
      case 'integration':
        return <Sparkles size={15} />;
      default:
        return <Bell size={15} />;
    }
  };

  const renderApiDisabledCard = (errObj, serviceName) => {
    if (!errObj) return null;
    return (
      <div className="integration-api-warning">
        <div className="integration-api-warning-head">
          <AlertTriangle size={18} />
          <strong>{serviceName} API Disabled in Google Cloud</strong>
        </div>
        <p>{errObj.error}</p>
        {errObj.enable_url && (
          <a
            href={errObj.enable_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-enable-google-api"
          >
            <span>Enable {serviceName} API</span>
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    );
  };

  const handleConfirmExecute = async () => {
    if (!confirmState.action) return;
    setConfirmLoading(true);
    try {
      await confirmState.action();
      setConfirmState({ isOpen: false, title: '', message: '', confirmText: 'Confirm', action: null });
    } finally {
      setConfirmLoading(false);
    }
  };

  const readCount = Math.max(0, notifications.length - unreadCount);
  const filteredNotifications = notifications.filter((n) => {
    if (notifFilter === 'unread') return !n.is_read;
    if (notifFilter === 'read') return n.is_read;
    return true;
  });

  return (
    <WorkspaceSidebarLayout title="Plugins">
      <div className="page-container integrations-page-container">
        <div className="page-header integrations-header">
          <div>
            <h1>Plugins</h1>
            <p className="subtitle">
              Shows Mail and Google Calendar for your signed-in account ({user?.email || 'Google account'}) and tracks notifications.
            </p>
          </div>
          {!loadingInit && (!calendarStatus.is_connected || !gmailStatus.is_connected) && (
            <button
              type="button"
              onClick={() => triggerWorkspaceConnect()}
              disabled={workspaceConnecting}
              className="btn-primary"
            >
              {workspaceConnecting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>
                {workspaceConnecting
                  ? 'Connecting...'
                  : `Sync Mail & Calendar (${user?.email || 'Signed-in Account'})`}
              </span>
            </button>
          )}
        </div>

        {/* Side-by-side Mail & Google Calendar Status Cards (Locked to Signed-In Account) */}
        {!loadingInit && (
          <div className="connect-workspace-grid">
            {/* Google Calendar Card */}
            <div className={`connect-workspace-card ${calendarStatus.is_connected ? 'connected' : ''}`}>
              <div className="connect-card-top">
                <div className="integration-brand-row">
                  <div className="integration-icon-badge calendar">
                    <Calendar size={21} />
                  </div>
                  <div>
                    <h3>Google Calendar</h3>
                    <p>
                      {calendarStatus.is_connected
                        ? calendarStatus.calendar_email || user?.email || 'Connected account'
                        : `Uses your signed-in account (${user?.email || 'Google'})`}
                    </p>
                  </div>
                </div>
                {calendarStatus.is_connected && (
                  <span className="connected-badge-pill">
                    <CheckCircle2 size={13} />
                    <span>Connected</span>
                  </span>
                )}
              </div>

              <div className="connect-card-actions">
                {calendarStatus.is_connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('calendar')}
                      className="btn-secondary btn-sm"
                    >
                      View Schedule
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          isOpen: true,
                          title: 'Disconnect Google Calendar',
                          message: 'Disconnect Google Calendar from Personal AI? You can reconnect anytime.',
                          confirmText: 'Disconnect',
                          action: async () => {
                            await integrationsService.disconnectCalendar();
                            setCalendarStatus({ is_connected: false, calendar_email: '' });
                            setCalendarEvents([]);
                            await refreshUserData();
                            showToast('Google Calendar disconnected.', 'info', 2500);
                          },
                        })
                      }
                      className="btn-secondary btn-sm btn-danger-outline"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => triggerWorkspaceConnect()}
                    disabled={workspaceConnecting}
                    className="btn-primary btn-full"
                  >
                    {workspaceConnecting ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                    <span>{workspaceConnecting ? 'Syncing...' : 'Enable Calendar & Mail'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Gmail Card */}
            <div className={`connect-workspace-card ${gmailStatus.is_connected ? 'connected' : ''}`}>
              <div className="connect-card-top">
                <div className="integration-brand-row">
                  <div className="integration-icon-badge gmail">
                    <Mail size={21} />
                  </div>
                  <div>
                    <h3>Mail (Gmail)</h3>
                    <p>
                      {gmailStatus.is_connected
                        ? gmailStatus.gmail_address || user?.email || 'Connected account'
                        : `Uses your signed-in account (${user?.email || 'Google'})`}
                    </p>
                  </div>
                </div>
                {gmailStatus.is_connected && (
                  <span className="connected-badge-pill">
                    <CheckCircle2 size={13} />
                    <span>Connected</span>
                  </span>
                )}
              </div>

              <div className="connect-card-actions">
                {gmailStatus.is_connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('gmail')}
                      className="btn-secondary btn-sm"
                    >
                      Open Inbox
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          isOpen: true,
                          title: 'Disconnect Gmail',
                          message: 'Disconnect Gmail from Personal AI? You can re-authorize anytime.',
                          confirmText: 'Disconnect',
                          action: async () => {
                            await integrationsService.disconnectGmail();
                            setGmailStatus({ is_connected: false, gmail_address: '' });
                            setGmailMessages([]);
                            await refreshUserData();
                            showToast('Gmail disconnected.', 'info', 2500);
                          },
                        })
                      }
                      className="btn-secondary btn-sm btn-danger-outline"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => triggerWorkspaceConnect()}
                    disabled={workspaceConnecting}
                    className="btn-primary btn-full"
                  >
                    {workspaceConnecting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                    <span>{workspaceConnecting ? 'Syncing...' : 'Enable Mail & Calendar'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="integrations-tabs" role="tablist">
          {INTEGRATION_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`integrations-tab-btn ${active ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.id === 'notifications' && unreadCount > 0 && (
                  <span className="tab-badge-count">{unreadCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {loadingInit ? (
          <div className="loading-center">
            <Loader2 size={28} className="animate-spin" />
            <p>Loading integrations...</p>
          </div>
        ) : (
          <div className="integrations-panel">
            {/* 1. GOOGLE CALENDAR TAB */}
            {activeTab === 'calendar' && (
              <section className="card integration-card-shell">
                <div className="integration-card-header">
                  <div className="integration-brand-row">
                    <div className="integration-icon-badge calendar">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <h2>Google Calendar</h2>
                      <p>View upcoming meetings, schedule new events, and ground chat replies on your calendar.</p>
                    </div>
                  </div>
                </div>

                {renderApiDisabledCard(calendarApiError, 'Google Calendar')}

                {calendarStatus.is_connected ? (
                  <div className="integration-two-col">
                    {/* Upcoming Events */}
                    <div className="integration-subpanel">
                      <div className="subpanel-header">
                        <h3>Upcoming Events</h3>
                        <div className="subpanel-controls">
                          <select
                            value={calendarDays}
                            onChange={(e) => {
                              const nextDays = Number(e.target.value);
                              setCalendarDays(nextDays);
                              loadCalendarEvents(nextDays);
                            }}
                            className="input-select-sm"
                          >
                            <option value={7}>Next 7 days</option>
                            <option value={14}>Next 14 days</option>
                            <option value={30}>Next 30 days</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => loadCalendarEvents(calendarDays)}
                            disabled={calendarLoading}
                            className="btn-icon-sm"
                            title="Refresh events"
                          >
                            <RefreshCw size={15} className={calendarLoading ? 'animate-spin' : ''} />
                          </button>
                        </div>
                      </div>

                      {calendarLoading ? (
                        <div className="subpanel-empty">
                          <Loader2 size={20} className="animate-spin" />
                          <span>Fetching events...</span>
                        </div>
                      ) : calendarEvents.length === 0 ? (
                        <div className="subpanel-empty">
                          <Calendar size={22} />
                          <span>No upcoming events in the next {calendarDays} days.</span>
                        </div>
                      ) : (
                        <div className="integration-list">
                          {calendarEvents.map((ev) => (
                            <div key={ev.id} className="integration-list-item">
                              <div className="item-main">
                                <div className="item-title-row">
                                  <strong>{ev.summary}</strong>
                                  {ev.html_link && (
                                    <a href={ev.html_link} target="_blank" rel="noopener noreferrer" className="item-ext-link">
                                      <ExternalLink size={13} />
                                    </a>
                                  )}
                                </div>
                                <div className="item-meta">
                                  <span>
                                    <Clock size={12} /> {new Date(ev.start).toLocaleString()}
                                  </span>
                                  {ev.location && (
                                    <span>
                                      <MapPin size={12} /> {ev.location}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => requestDeleteEvent(ev)}
                                disabled={deletingEventId === ev.id}
                                className="btn-icon-danger"
                                title="Delete event"
                              >
                                {deletingEventId === ev.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Create Event Form */}
                    <form onSubmit={handleCreateEvent} className="integration-subpanel" noValidate>
                      <div className="subpanel-header">
                        <h3>Create Event</h3>
                      </div>

                      <div className="form-group">
                        <label htmlFor="cal-summary">Event Title *</label>
                        <input
                          id="cal-summary"
                          type="text"
                          value={eventForm.summary}
                          onChange={(e) => {
                            setEventForm((p) => ({ ...p, summary: e.target.value }));
                            if (eventErrors.summary) setEventErrors((er) => ({ ...er, summary: '' }));
                          }}
                          placeholder="e.g., Architecture Review"
                          maxLength={200}
                        />
                        {eventErrors.summary && <span className="field-error-text">{eventErrors.summary}</span>}
                      </div>

                      <div className="form-row-2">
                        <div className="form-group">
                          <label htmlFor="cal-start">Start Time *</label>
                          <input
                            id="cal-start"
                            type="datetime-local"
                            value={eventForm.start_time}
                            onChange={(e) => {
                              setEventForm((p) => ({ ...p, start_time: e.target.value }));
                              if (eventErrors.start_time) setEventErrors((er) => ({ ...er, start_time: '' }));
                            }}
                          />
                          {eventErrors.start_time && <span className="field-error-text">{eventErrors.start_time}</span>}
                        </div>
                        <div className="form-group">
                          <label htmlFor="cal-end">End Time *</label>
                          <input
                            id="cal-end"
                            type="datetime-local"
                            value={eventForm.end_time}
                            onChange={(e) => {
                              setEventForm((p) => ({ ...p, end_time: e.target.value }));
                              if (eventErrors.end_time) setEventErrors((er) => ({ ...er, end_time: '' }));
                            }}
                          />
                          {eventErrors.end_time && <span className="field-error-text">{eventErrors.end_time}</span>}
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="cal-location">Location (Optional)</label>
                        <input
                          id="cal-location"
                          type="text"
                          value={eventForm.location}
                          onChange={(e) => setEventForm((p) => ({ ...p, location: e.target.value }))}
                          placeholder="Google Meet or Room 2B"
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="cal-desc">Description (Optional)</label>
                        <textarea
                          id="cal-desc"
                          rows={2}
                          value={eventForm.description}
                          onChange={(e) => setEventForm((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Agenda notes..."
                        />
                      </div>

                      <button type="submit" disabled={creatingEvent} className="btn-primary btn-full">
                        {creatingEvent ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        <span>{creatingEvent ? 'Creating Event...' : 'Add to Google Calendar'}</span>
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="integration-connect-callout">
                    <p>
                      Connect Google Calendar above to manage upcoming events here and ask Personal AI about your schedule.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* 2. GMAIL TAB */}
            {activeTab === 'gmail' && (
              <section className="card integration-card-shell">
                <div className="integration-card-header">
                  <div className="integration-brand-row">
                    <div className="integration-icon-badge gmail">
                      <Mail size={20} />
                    </div>
                    <div>
                      <h2>Mail (Gmail)</h2>
                      <p>Search recent inbox messages, compose emails, and ask Personal AI about your inbox.</p>
                    </div>
                  </div>
                </div>

                {renderApiDisabledCard(gmailApiError, 'Gmail')}

                {gmailStatus.is_connected ? (
                  <div className="integration-two-col">
                    {/* Inbox Messages */}
                    <div className="integration-subpanel">
                      <div className="subpanel-header">
                        <h3>Inbox</h3>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            loadGmailMessages(gmailSearch);
                          }}
                          className="subpanel-search-form"
                        >
                          <input
                            type="text"
                            value={gmailSearch}
                            onChange={(e) => setGmailSearch(e.target.value)}
                            placeholder="Search mail..."
                            className="input-search-sm"
                          />
                          <button type="submit" disabled={gmailLoading} className="btn-icon-sm" title="Search Gmail">
                            <Search size={14} />
                          </button>
                        </form>
                      </div>

                      {gmailLoading ? (
                        <div className="subpanel-empty">
                          <Loader2 size={20} className="animate-spin" />
                          <span>Loading messages...</span>
                        </div>
                      ) : gmailMessages.length === 0 ? (
                        <div className="subpanel-empty">
                          <Mail size={22} />
                          <span>No messages matched your inbox query.</span>
                        </div>
                      ) : (
                        <div className="integration-list">
                          {gmailMessages.map((msg) => (
                            <div key={msg.id} className="integration-list-item email-item">
                              <div className="item-main">
                                <div className="item-title-row">
                                  <strong>{msg.subject || '(No Subject)'}</strong>
                                </div>
                                <div className="item-meta">
                                  <span>{msg.from}</span>
                                </div>
                                {msg.snippet && <p className="item-snippet">{msg.snippet}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Compose Email */}
                    <form onSubmit={handleSendEmail} className="integration-subpanel" noValidate>
                      <div className="subpanel-header">
                        <h3>Compose &amp; Send</h3>
                      </div>

                      <div className="form-group">
                        <label htmlFor="gmail-to">Recipient Email *</label>
                        <input
                          id="gmail-to"
                          type="email"
                          value={emailForm.to}
                          onChange={(e) => {
                            setEmailForm((p) => ({ ...p, to: e.target.value }));
                            if (emailErrors.to) setEmailErrors((er) => ({ ...er, to: '' }));
                          }}
                          placeholder="colleague@example.com"
                        />
                        {emailErrors.to && <span className="field-error-text">{emailErrors.to}</span>}
                      </div>

                      <div className="form-group">
                        <label htmlFor="gmail-subject">Subject *</label>
                        <input
                          id="gmail-subject"
                          type="text"
                          value={emailForm.subject}
                          onChange={(e) => {
                            setEmailForm((p) => ({ ...p, subject: e.target.value }));
                            if (emailErrors.subject) setEmailErrors((er) => ({ ...er, subject: '' }));
                          }}
                          placeholder="Project update..."
                          maxLength={250}
                        />
                        {emailErrors.subject && <span className="field-error-text">{emailErrors.subject}</span>}
                      </div>

                      <div className="form-group">
                        <label htmlFor="gmail-body">Message *</label>
                        <textarea
                          id="gmail-body"
                          rows={4}
                          value={emailForm.body}
                          onChange={(e) => {
                            setEmailForm((p) => ({ ...p, body: e.target.value }));
                            if (emailErrors.body) setEmailErrors((er) => ({ ...er, body: '' }));
                          }}
                          placeholder="Write your email..."
                        />
                        {emailErrors.body && <span className="field-error-text">{emailErrors.body}</span>}
                      </div>

                      <button type="submit" disabled={sendingEmail} className="btn-primary btn-full">
                        {sendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        <span>{sendingEmail ? 'Sending...' : 'Send via Gmail'}</span>
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="integration-connect-callout">
                    <p>
                      Connect Mail above to read recent Gmail threads and send messages directly from Personal AI.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* 3. NOTIFICATIONS TAB (Clean Read / Unread + Mark as Read) */}
            {activeTab === 'notifications' && (
              <section className="card integration-card-shell">
                <div className="integration-card-header">
                  <div className="integration-brand-row">
                    <div className="integration-icon-badge notifications">
                      <Bell size={20} />
                    </div>
                    <div>
                      <h2>Notifications</h2>
                      <p>Review unread and read alerts cleanly.</p>
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="btn-mark-all-read"
                    >
                      <CheckCheck size={15} />
                      <span>Mark all as read</span>
                    </button>
                  )}
                </div>

                {/* Web App Notification Sound & Browser Alert Bar */}
                <div className="notifications-browser-bar">
                  <div className="notifications-browser-status">
                    <span>
                      Web App Sound:{' '}
                      <strong className={`permission-tag ${soundEnabled ? 'granted' : 'denied'}`}>
                        {soundEnabled ? 'Chord On' : 'Muted'}
                      </strong>
                    </span>
                    <span className="notif-bar-sep">•</span>
                    <span>
                      Browser Alerts:{' '}
                      <strong className={`permission-tag ${notifPermission}`}>
                        {notifPermission === 'granted'
                          ? 'Allowed'
                          : notifPermission === 'denied'
                            ? 'Blocked'
                            : notifPermission === 'unsupported'
                              ? 'Unsupported'
                              : 'Not enabled'}
                      </strong>
                    </span>
                  </div>
                  <div className="notifications-browser-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const next = setNotificationSoundEnabled(!soundEnabled);
                        setSoundEnabled(next);
                        if (next) {
                          playNotificationChord({ force: true });
                          showToast('Notification chord sound enabled.', 'info', 2000);
                        } else {
                          showToast('Notification sound muted.', 'info', 2000);
                        }
                      }}
                      className="btn-secondary btn-sm"
                    >
                      {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      <span>{soundEnabled ? 'Mute' : 'Unmute'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => playNotificationChord({ force: true })}
                      className="btn-secondary btn-sm"
                    >
                      <Music2 size={14} />
                      <span>Test Sound</span>
                    </button>
                    {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const perm = await requestBrowserNotificationPermission();
                          setNotifPermission(perm);
                          if (perm === 'granted') {
                            showToast('Browser notifications enabled!', 'success', 2500);
                            triggerDesktopNotification('Notifications Active', 'Chord alerts are ready.');
                          }
                        }}
                        className="btn-primary btn-sm"
                      >
                        <Bell size={14} />
                        <span>Enable Alerts</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills: All / Unread / Read */}
                <div className="notif-filter-bar" role="tablist">
                  <button
                    type="button"
                    onClick={() => setNotifFilter('all')}
                    className={`notif-filter-pill ${notifFilter === 'all' ? 'active' : ''}`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifFilter('unread')}
                    className={`notif-filter-pill ${notifFilter === 'unread' ? 'active' : ''}`}
                  >
                    Unread ({unreadCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifFilter('read')}
                    className={`notif-filter-pill ${notifFilter === 'read' ? 'active' : ''}`}
                  >
                    Read ({readCount})
                  </button>
                </div>

                {filteredNotifications.length === 0 ? (
                  <div className="subpanel-empty notif-empty-card">
                    <Bell size={28} style={{ opacity: 0.45 }} />
                    <span>
                      {notifFilter === 'unread'
                        ? 'No unread notifications'
                        : notifFilter === 'read'
                          ? 'No read notifications yet'
                          : 'No notifications yet'}
                    </span>
                  </div>
                ) : (
                  <div className="integration-list">
                    {filteredNotifications.map((n) => (
                      <div key={n.id} className={`integration-list-item ${n.is_read ? 'read-item' : 'unread-alert'}`}>
                        <div className={`notif-cat-icon ${n.category}`}>
                          {getCategoryIcon(n.category)}
                        </div>
                        <div className="item-main">
                          <div className="item-title-row">
                            <strong>{n.title}</strong>
                            <span className={`notif-status-tag ${n.is_read ? 'read' : 'unread'}`}>
                              {n.is_read ? 'Read' : 'Unread'}
                            </span>
                          </div>
                          <p className="item-snippet">{n.message}</p>
                          <div className="item-meta">
                            <span>{new Date(n.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => handleMarkOneRead(n)}
                            className="btn-mark-item-read"
                            title="Mark as read"
                          >
                            <Check size={14} />
                            <span>Mark as read</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

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
