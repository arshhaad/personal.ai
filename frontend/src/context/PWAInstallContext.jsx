import { useState, useEffect, useCallback } from 'react';
import { PWAInstallContext } from './PWAInstallContextDefinition';

export function PWAInstallProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  });
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent) && !window.MSStream;
  });
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    // Listen for beforeinstallprompt event (Chrome, Edge, Opera, Samsung Internet)
    const handleBeforeInstallPrompt = (e) => {
      // Prevent automatic mini-infobar or default banner
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // Listen for successful install
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsGuideOpen(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installPWA = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('PWA install error:', err);
      }
    } else if (isIOS || !isInstalled) {
      // Show instructional modal for iOS or manual desktop instructions
      setIsGuideOpen(true);
    }
  }, [deferredPrompt, isIOS, isInstalled]);

  const closeGuide = useCallback(() => {
    setIsGuideOpen(false);
  }, []);

  const value = {
    deferredPrompt,
    isInstallable: Boolean(deferredPrompt) || (isIOS && !isInstalled) || !isInstalled,
    isInstalled,
    isIOS,
    isGuideOpen,
    installPWA,
    closeGuide,
  };

  return (
    <PWAInstallContext.Provider value={value}>
      {children}
    </PWAInstallContext.Provider>
  );
}
