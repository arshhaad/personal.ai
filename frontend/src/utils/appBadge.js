// Manages the Notification Badge on the installed Web App icon (Badging API),
// the browser tab favicon icon, and the page title count.

const ORIGINAL_FAVICON_HREF = '/favicon.svg?v=2';
let baseTitle = '';
let baseIconPromise = null;
let lastAppliedCount = -1;

function getBaseTitle() {
  if (typeof document === 'undefined') return 'Personal AI';
  if (!baseTitle) {
    baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, '') || 'Personal AI';
  }
  return baseTitle;
}

function loadBaseIconImage() {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  if (!baseIconPromise) {
    baseIconPromise = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/icon-192.png?v=2';
    });
  }
  return baseIconPromise;
}

function setFaviconHref(href) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

async function renderFaviconBadge(count) {
  if (typeof document === 'undefined') return;
  if (count <= 0) {
    setFaviconHref(ORIGINAL_FAVICON_HREF);
    return;
  }

  const baseImg = await loadBaseIconImage();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (baseImg) {
    ctx.drawImage(baseImg, 0, 0, size, size);
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const label = count > 9 ? '9+' : String(count);
  const badgeRadius = label.length > 1 ? 19 : 16;
  const cx = size - badgeRadius - 1;
  const cy = badgeRadius + 1;

  // Outer contrast ring
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(cx, cy, badgeRadius + 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Red notification badge circle
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2);
  ctx.fill();

  // White unread count text
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${label.length > 1 ? 19 : 22}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);

  try {
    setFaviconHref(canvas.toDataURL('image/png'));
  } catch {
    // ignore canvas taint errors
  }
}

export function updateAppNotificationBadge(unreadCount) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const count = Math.max(0, Number(unreadCount) || 0);
  if (count === lastAppliedCount) return;
  lastAppliedCount = count;

  // 1. Update browser tab title
  const cleanTitle = getBaseTitle();
  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${cleanTitle}` : cleanTitle;

  // 2. Update PWA App Icon Badge (Badging API)
  try {
    if (count > 0 && typeof navigator.setAppBadge === 'function') {
      navigator.setAppBadge(count).catch(() => {});
    } else if (count === 0 && typeof navigator.clearAppBadge === 'function') {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch {
    // ignore unsupported Badging API
  }

  // 3. Forward badge count to Service Worker if active
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_APP_BADGE',
        count,
      });
    }
  } catch {
    // ignore SW messaging errors
  }

  // 4. Update Favicon Icon Badge
  renderFaviconBadge(count);
}
