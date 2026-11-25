const TIMEZONE_PREF_KEY = 'preferred_reminder_timezone';
const TIMEZONE_CHANGED_EVENT = 'reminder-timezone-changed';

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function getDetectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getAllTimezones(detectedTz = getDetectedTimezone()) {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const supported = Intl.supportedValuesOf('timeZone') || [];
      if (supported.length > 0) {
        return supported.includes(detectedTz) ? supported : [detectedTz, ...supported];
      }
    }
  } catch {
    // Fallback below
  }
  return COMMON_TIMEZONES.includes(detectedTz)
    ? COMMON_TIMEZONES
    : [detectedTz, ...COMMON_TIMEZONES];
}

export function getPreferredTimezone() {
  const detected = getDetectedTimezone();
  if (typeof window === 'undefined') return detected;
  try {
    const saved = localStorage.getItem(TIMEZONE_PREF_KEY);
    const choices = getAllTimezones(detected);
    if (saved && choices.includes(saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return detected;
}

export function setPreferredTimezone(nextTz) {
  if (typeof window === 'undefined' || !nextTz) return nextTz;
  try {
    localStorage.setItem(TIMEZONE_PREF_KEY, nextTz);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(TIMEZONE_CHANGED_EVENT, { detail: { timezone: nextTz } }));
  return nextTz;
}

export function subscribeTimezoneChange(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    listener(event?.detail?.timezone || getPreferredTimezone());
  };
  const storageHandler = (event) => {
    if (event.key === TIMEZONE_PREF_KEY) {
      listener(getPreferredTimezone());
    }
  };
  window.addEventListener(TIMEZONE_CHANGED_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(TIMEZONE_CHANGED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
