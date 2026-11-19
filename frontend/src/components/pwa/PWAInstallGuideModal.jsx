import { X, Share2, PlusSquare, Download, Smartphone, Monitor, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../context/usePWAInstall';

export default function PWAInstallGuideModal() {
  const { isGuideOpen, closeGuide, isIOS, isInstalled } = usePWAInstall();

  if (!isGuideOpen) return null;

  return (
    <div className="pwa-modal-backdrop" onClick={closeGuide} role="dialog" aria-modal="true">
      <div className="pwa-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pwa-modal-header">
          <div className="pwa-modal-title-box">
            <div className="pwa-modal-icon-badge">
              {isIOS ? <Smartphone size={20} /> : <Download size={20} />}
            </div>
            <div>
              <h3 className="pwa-modal-title">
                {isInstalled ? 'App Already Installed' : 'Install Personal AI'}
              </h3>
              <p className="pwa-modal-subtitle">
                {isIOS
                  ? 'Add to iPhone or iPad Home Screen'
                  : 'Install Web App on your device'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="pwa-modal-close"
            onClick={closeGuide}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="pwa-modal-body">
          {isInstalled ? (
            <div className="pwa-installed-success">
              <CheckCircle2 size={44} className="pwa-success-icon" />
              <p className="pwa-success-text">
                Personal AI is already installed on this device! You can launch it directly from your home screen or application launcher.
              </p>
            </div>
          ) : isIOS ? (
            <div className="pwa-steps-list">
              <div className="pwa-step-item">
                <div className="pwa-step-num">1</div>
                <div className="pwa-step-content">
                  <div className="pwa-step-text">
                    Tap the <strong>Share</strong> button at the bottom of your Safari browser window.
                  </div>
                  <div className="pwa-step-badge">
                    <Share2 size={16} />
                    <span>Share Icon</span>
                  </div>
                </div>
              </div>

              <div className="pwa-step-item">
                <div className="pwa-step-num">2</div>
                <div className="pwa-step-content">
                  <div className="pwa-step-text">
                    Scroll down through the share options and tap <strong>Add to Home Screen</strong>.
                  </div>
                  <div className="pwa-step-badge">
                    <PlusSquare size={16} />
                    <span>Add to Home Screen</span>
                  </div>
                </div>
              </div>

              <div className="pwa-step-item">
                <div className="pwa-step-num">3</div>
                <div className="pwa-step-content">
                  <div className="pwa-step-text">
                    Tap <strong>Add</strong> in the top right corner. Personal AI is now installed on your device with full offline capabilities!
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="pwa-steps-list">
              <div className="pwa-step-item">
                <div className="pwa-step-num">1</div>
                <div className="pwa-step-content">
                  <div className="pwa-step-text">
                    Look at the right side of your browser address bar and click the <strong>Install</strong> icon.
                  </div>
                  <div className="pwa-step-badge">
                    <Monitor size={16} />
                    <span>Address Bar Install Button</span>
                  </div>
                </div>
              </div>

              <div className="pwa-step-item">
                <div className="pwa-step-num">2</div>
                <div className="pwa-step-content">
                  <div className="pwa-step-text">
                    Alternatively, click the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) and select <strong>&quot;Install Personal AI...&quot;</strong>.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pwa-modal-footer">
          <button type="button" className="pwa-modal-btn-done" onClick={closeGuide}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
