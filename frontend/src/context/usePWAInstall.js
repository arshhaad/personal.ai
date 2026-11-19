import { useContext } from 'react';
import { PWAInstallContext } from './PWAInstallContextDefinition';

export function usePWAInstall() {
  const context = useContext(PWAInstallContext);
  if (!context) {
    throw new Error('usePWAInstall must be used within a PWAInstallProvider');
  }
  return context;
}
