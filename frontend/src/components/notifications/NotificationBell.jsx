import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { integrationsService } from '../../services/integrationsService';
import { useToast } from '../../context/useToast';
import { triggerDesktopNotification } from '../../utils/desktopNotification';
import { updateAppNotificationBadge } from '../../utils/appBadge';
import {
  initAudioUnlock,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  subscribeNotificationSoundChange,
  playNotificationChord,
} from '../../utils/notificationSound';
import {
  Bell,
  AlarmClock,
  Calendar,
  Mail,
  FileText,
  Sparkles,
  CheckCheck,
  Check,
  Volume2,
  VolumeX,
} from 'lucide-react';

export default function NotificationBell() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread' | 'read'
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());
  const [nowTs, setNowTs] = useState(() => Date.now());
  const containerRef = useRef(null);
  const notifiedIdsRef = useRef(new Set());
  const knownNotifIdsRef = useRef(new Set());
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    updateAppNotificationBadge(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    initAudioUnlock();
    return subscribeNotificationSoundChange((enabled) => {
      setSoundEnabled(enabled);
    });
  }, []);

  const processIncomingData = useCallback((data) => {
    const incomingList = data?.notifications || [];
    const triggeredList = Array.isArray(data?.newly_triggered_reminders)
      ? data.newly_triggered_reminders
      : [];

    setNotifications(incomingList);
    setUnreadCount(data?.unread_count || 0);
    setNowTs(Date.now());

    let alertedThisPoll = false;

    if (triggeredList.length > 0) {
      triggeredList.forEach((rem) => {
        const key = `${rem.id}-${rem.scheduled_at}`;
        if (notifiedIdsRef.current.has(key)) return;
        notifiedIdsRef.current.add(key);
        alertedThisPoll = true;

        const body = rem.message || rem.display_schedule || 'Scheduled reminder is due.';
        showToast(`Reminder: ${rem.title}`, 'info', 5000);
        triggerDesktopNotification(`Reminder: ${rem.title}`, body, {
          tag: `reminder-${rem.id}`,
          url: '/reminders',
        });
      });

      window.dispatchEvent(new Event('reminders-updated'));
    }

    if (!hasInitializedRef.current) {
      incomingList.forEach((n) => knownNotifIdsRef.current.add(n.id));
      hasInitializedRef.current = true;
      return;
    }

    const brandNewUnread = incomingList.filter(
      (n) => !n.is_read && !knownNotifIdsRef.current.has(n.id)
    );
    incomingList.forEach((n) => knownNotifIdsRef.current.add(n.id));

    if (brandNewUnread.length > 0 && !alertedThisPoll) {
      const latest = brandNewUnread[0];
      showToast(latest.title, 'info', 4500);
      triggerDesktopNotification(latest.title, latest.message, {
        tag: `notif-${latest.id}`,
        url: latest.action_url || '/integrations',
      });
    }
  }, [showToast]);

  const fetchNotifications = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const data = await integrationsService.getNotifications();
      processIncomingData(data);
    } catch {
      // ignore background poll errors
    } finally {
      if (!silent) setLoading(false);
    }
  }, [processIncomingData]);

  useEffect(() => {
    let isMounted = true;
    integrationsService.getNotifications()
      .then((data) => {
        if (!isMounted) return;
        processIncomingData(data);
      })
      .catch(() => {
        // ignore initial background fetch errors
      });

    // Poll even when tab is inactive so Browser/PWA Notifications + chord sound fire when due
    const interval = setInterval(() => {
      integrationsService.getNotifications()
        .then((data) => {
          if (!isMounted) return;
          processIncomingData(data);
        })
        .catch(() => {
          // ignore background poll errors
        });
    }, 25000);

    const handleExternalUpdate = (event) => {
      if (typeof event?.detail?.unreadCount === 'number') {
        setUnreadCount(event.detail.unreadCount);
      } else {
        fetchNotifications(true);
      }
    };
    window.addEventListener('notifications-updated', handleExternalUpdate);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('notifications-updated', handleExternalUpdate);
    };
  }, [processIncomingData, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      fetchNotifications(false);
    }
  };

  const handleToggleSound = () => {
    const next = setNotificationSoundEnabled(!soundEnabled);
    setSoundEnabled(next);
    if (next) {
      playNotificationChord({ force: true });
      showToast('Notification chord sound enabled.', 'info', 2000);
    } else {
      showToast('Notification sound muted.', 'info', 2000);
    }
  };

  const handleItemClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await integrationsService.markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // ignore
      }
    }
    if (notif.action_url) {
      setIsOpen(false);
      navigate(notif.action_url);
    }
  };

  const handleMarkAsRead = async (notif, e) => {
    if (e) e.stopPropagation();
    if (notif.is_read) return;
    try {
      await integrationsService.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await integrationsService.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const readCount = Math.max(0, notifications.length - unreadCount);
  const visibleNotifications = notifications.filter((n) => {
    if (filterTab === 'unread') return !n.is_read;
    if (filterTab === 'read') return n.is_read;
    return true;
  });

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'reminder':
        return <AlarmClock size={14} />;
      case 'calendar':
        return <Calendar size={14} />;
      case 'email':
        return <Mail size={14} />;
      case 'document':
        return <FileText size={14} />;
      case 'integration':
        return <Sparkles size={14} />;
      default:
        return <Bell size={14} />;
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const diffMs = Math.max(0, nowTs - new Date(iso).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="notification-bell-wrapper" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="btn-topbar-icon notification-bell-btn"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="notification-unread-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-popover" role="dialog" aria-label="Notifications">
          <div className="notification-popover-header">
            <span className="notification-popover-title">Notifications</span>
            <div className="notification-popover-actions">
              <button
                type="button"
                onClick={handleToggleSound}
                className={`btn-notif-header-action ${soundEnabled ? 'sound-on' : 'sound-muted'}`}
                title={soundEnabled ? 'Notification chord sound: ON (click to mute)' : 'Notification chord sound: OFF (click to enable)'}
                aria-label={soundEnabled ? 'Mute notification sound' : 'Enable notification sound'}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{soundEnabled ? 'Chord' : 'Muted'}</span>
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="btn-notif-header-action"
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Mark read</span>
                </button>
              )}
            </div>
          </div>

          {notifications.length > 0 && (
            <div className="notif-popover-filters">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`notif-mini-tab ${filterTab === 'all' ? 'active' : ''}`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('unread')}
                className={`notif-mini-tab ${filterTab === 'unread' ? 'active' : ''}`}
              >
                Unread ({unreadCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('read')}
                className={`notif-mini-tab ${filterTab === 'read' ? 'active' : ''}`}
              >
                Read ({readCount})
              </button>
            </div>
          )}

          <div className="notification-popover-list">
            {loading && notifications.length === 0 ? (
              <div className="notification-empty-state">Loading notifications...</div>
            ) : visibleNotifications.length === 0 ? (
              <div className="notification-empty-state">
                <Bell size={24} style={{ opacity: 0.4 }} />
                <span>
                  {filterTab === 'unread' && notifications.length > 0
                    ? 'No unread notifications'
                    : filterTab === 'read' && notifications.length > 0
                      ? 'No read notifications yet'
                      : 'No notifications yet'}
                </span>
              </div>
            ) : (
              visibleNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`notification-item ${!notif.is_read ? 'unread' : 'read'}`}
                >
                  <div className={`notif-cat-icon ${notif.category}`}>
                    {getCategoryIcon(notif.category)}
                  </div>
                  <div className="notif-body">
                    <div className="notif-title-row">
                      <span className="notif-title">{notif.title}</span>
                      <span className="notif-time">{formatTime(notif.created_at)}</span>
                    </div>
                    <p className="notif-msg">{notif.message}</p>
                    <div className="notif-item-footer">
                      <span className={`notif-state-dot ${notif.is_read ? 'read' : 'unread'}`}>
                        {notif.is_read ? 'Read' : 'Unread'}
                      </span>
                      {!notif.is_read && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(notif, e)}
                          className="btn-notif-mark-one"
                        >
                          <Check size={12} />
                          <span>Mark as read</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
