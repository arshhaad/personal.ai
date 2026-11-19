import { Download, CheckCircle2, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../../context/usePWAInstall';

export default function InstallButton({
  variant = 'landing-small',
  className = '',
  label = 'Install App',
}) {
  const { isInstalled, installPWA, isIOS } = usePWAInstall();

  if (isInstalled) {
    return (
      <div className={`pwa-install-btn installed ${variant} ${className}`} title="Personal AI is installed">
        <CheckCircle2 size={14} className="install-icon-check" />
        <span className="install-btn-text">Installed</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={installPWA}
      className={`pwa-install-btn ${variant} ${className}`}
      title={isIOS ? 'Install Personal AI on your iPhone/iPad' : 'Install Personal AI as a desktop or mobile Web App'}
      aria-label="Install Personal AI as an application"
    >
      {isIOS ? (
        <Smartphone size={14} className="install-btn-icon" />
      ) : (
        <Download size={14} className="install-btn-icon" />
      )}
      <span className="install-btn-text">{label}</span>
    </button>
  );
}
