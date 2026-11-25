import { playNotificationChord } from './notificationSound';

export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission || 'default';
  }
}

export function triggerDesktopNotification(title, body, options = {}) {
  if (typeof window === 'undefined') return;

  const shouldPlaySound = !options.silent;
  const playPromise = shouldPlaySound
    ? playNotificationChord({ force: Boolean(options.forceSound) })
    : Promise.resolve(false);

  if (shouldPlaySound && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([100, 50, 120]);
    } catch {
      // ignore unsupported vibration contexts
    }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  playPromise.then((chordPlayed) => {
    const notifOptions = {
      body: body || '',
      icon: '/icon-192.png?v=2',
      badge: '/icon-192.png?v=2',
      tag: options.tag || `personal-ai-${Date.now()}`,
      renotify: Boolean(options.tag),
      // Avoid playing an overlapping OS chime when our web app chord already played
      silent: Boolean(options.silent) || chordPlayed,
      vibrate: [100, 50, 120],
      data: {
        url: options.url || '/reminders',
      },
    };

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
          .then((registration) => {
            if (registration && typeof registration.showNotification === 'function') {
              return registration.showNotification(title, notifOptions);
            }
            new Notification(title, notifOptions);
            return null;
          })
          .catch(() => {
            try {
              new Notification(title, notifOptions);
            } catch {
              // Ignore restricted notification environments
            }
          });
        return;
      }

      new Notification(title, notifOptions);
    } catch {
      // Ignore restricted notification environments
    }
  });
}
