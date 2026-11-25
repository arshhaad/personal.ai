import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LogOut, Loader2 } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading && onCancel) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const isLogout = variant === 'logout';

  return createPortal(
    <div
      className="modal-backdrop"
      style={{ zIndex: 1200 }}
      onClick={() => !loading && onCancel && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="modal-card destructive-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="destructive-modal-header">
          <div className={`warning-icon-box ${isLogout ? 'logout-icon-box' : ''}`}>
            {isLogout ? (
              <LogOut size={22} color="#f59e0b" />
            ) : (
              <AlertTriangle size={24} color="#ef4444" />
            )}
          </div>
          <div>
            <h3 id="confirm-modal-title">{title}</h3>
            <p>{message}</p>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="btn-secondary"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="btn-destructive-solid"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
