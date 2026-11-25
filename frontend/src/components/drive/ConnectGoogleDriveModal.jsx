import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { googleDriveService } from '../../services/googleDriveService';
import {
  CheckCircle2,
  Lock,
  FileText,
  ShieldCheck,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';

export default function ConnectGoogleDriveModal({
  isOpen,
  onClose,
  onConnected,
  showSkip = true,
}) {
  const { user, refreshUserData } = useAuth();
  const { showToast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const PERMISSION_TEXT =
    'Allow Personal Assistant AI to create and manage files that you select or create with this application.';

  const triggerDriveLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file',
    flow: 'auth-code',
    hint: user?.email || undefined,
    select_account: false,
    include_granted_scopes: true,
    onSuccess: async (codeResponse) => {
      setConnecting(true);
      setErrorMessage(null);
      try {
        const result = await googleDriveService.connect({
          code: codeResponse.code,
          redirect_uri: 'postmessage',
        });
        await refreshUserData();
        showToast('Google Drive connected successfully!', 'success', 3500);
        if (onConnected) onConnected(result);
        onClose();
      } catch (err) {
        const msg =
          err.response?.data?.error ||
          err.message ||
          'Failed to connect Google Drive. Please ensure Drive API is enabled.';
        setErrorMessage(msg);
        showToast(msg, 'error', 4000);
      } finally {
        setConnecting(false);
      }
    },
    onError: (errorResponse) => {
      const msg =
        errorResponse.error_description ||
        'Google Drive authorization was cancelled or encountered an error.';
      setErrorMessage(msg);
      showToast(msg, 'error', 3000);
    },
  });

  if (!isOpen) return null;

  const userEmail = user?.email || user?.username || 'user';

  return (
    <div className="drive-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drive-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drive-modal-header">
          <div className="drive-modal-title-wrap">
            <div className="drive-icon-pill">
              <svg viewBox="0 0 87.3 78" className="google-drive-logo" width="24" height="24">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-25.4-44c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25z" fill="#ffba00"/>
                <path d="M73.55 76.8c1.6 0 3.15-.45 4.5-1.2l-18.25-31.6-16.15 28 4.2 4.8z" fill="#2684fc"/>
              </svg>
            </div>
            <div>
              <h2 className="drive-modal-title">Connect Google Drive</h2>
              <p className="drive-modal-subtitle">Step 2 of Onboarding Authorization</p>
            </div>
          </div>
          <button
            type="button"
            className="drive-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Multi-Step Flow Indicator */}
        <div className="auth-steps-stepper">
          {/* Step 1: Verified */}
          <div className="stepper-step completed">
            <div className="stepper-badge">
              <CheckCircle2 size={16} />
            </div>
            <div className="stepper-info">
              <span className="stepper-label">Step 1: Google Authentication</span>
              <span className="stepper-status">Identity Verified • {userEmail}</span>
            </div>
          </div>

          <div className="stepper-divider active"></div>

          {/* Step 2: Active */}
          <div className="stepper-step active">
            <div className="stepper-badge active">2</div>
            <div className="stepper-info">
              <span className="stepper-label">Step 2: Connect Google Drive</span>
              <span className="stepper-status">Permission Request Pending</span>
            </div>
          </div>
        </div>

        {/* Modal Body: Permission Request */}
        <div className="drive-modal-body">
          {/* Prompt Quote Banner */}
          <div className="drive-permission-banner">
            <div className="permission-banner-tag">
              <ShieldCheck size={14} />
              <span>Requested Google Permission</span>
            </div>
            <blockquote className="permission-quote-text">
              &ldquo;{PERMISSION_TEXT}&rdquo;
            </blockquote>
          </div>

          {/* Value Props & Scope Clarification */}
          <div className="drive-benefits-list">
            <div className="benefit-item">
              <div className="benefit-icon-box">
                <FileText size={17} />
              </div>
              <div className="benefit-text">
                <strong>Ground AI with your Documents</strong>
                <p>Import PDFs, notes, and research from Drive directly into your Personal AI Knowledge Base.</p>
              </div>
            </div>

            <div className="benefit-item">
              <div className="benefit-icon-box">
                <Sparkles size={17} />
              </div>
              <div className="benefit-text">
                <strong>Save & Export Responses</strong>
                <p>Create summaries and reports from chat and save them straight to your Google Drive.</p>
              </div>
            </div>

            <div className="benefit-item">
              <div className="benefit-icon-box secure">
                <Lock size={17} />
              </div>
              <div className="benefit-text">
                <strong>Privacy-First Scope (drive.file)</strong>
                <p>Personal Assistant AI only has access to files you explicitly select or create with this app. We cannot read or edit other Drive files.</p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="drive-modal-error">
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="drive-modal-footer">
          {showSkip && (
            <button
              type="button"
              className="btn-drive-skip"
              onClick={onClose}
              disabled={connecting}
            >
              Skip for Now
            </button>
          )}

          <button
            type="button"
            className="btn-drive-allow"
            onClick={() => triggerDriveLogin()}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Connecting Drive...</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 87.3 78" width="16" height="16" className="btn-drive-icon">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#ffffff"/>
                  <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#ffffff"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ffffff"/>
                  <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#ffffff"/>
                  <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-25.4-44c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25z" fill="#ffffff"/>
                  <path d="M73.55 76.8c1.6 0 3.15-.45 4.5-1.2l-18.25-31.6-16.15 28 4.2 4.8z" fill="#ffffff"/>
                </svg>
                <span>Allow & Connect Google Drive</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
