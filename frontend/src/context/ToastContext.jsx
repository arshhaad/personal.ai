import { useState, useCallback, useMemo } from 'react';
import { ToastContext } from './ToastContextDefinition';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const showToast = useCallback(
    (message, type = 'success', duration = 3000) => {
      if (!message) return;
      const id = Date.now() + Math.random().toString(36).substring(2, 9);
      const newToast = { id, message, type, isExiting: false, duration };

      setToasts((prev) => [...prev, newToast]);

      // Start exit animation 250ms before removal
      const exitTimer = setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
        );
      }, Math.max(duration - 250, 500));

      // Final removal at exactly duration (3 seconds)
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(removeTimer);
      };
    },
    []
  );

  const value = useMemo(
    () => ({
      showToast,
      removeToast,
    }),
    [showToast, removeToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Top Right Floating Modal Toast Container */}
      <div className="app-toast-container" aria-live="polite">
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const isInfo = toast.type === 'info';
          return (
            <div
              key={toast.id}
              className={`app-modal-toast ${toast.type} ${toast.isExiting ? 'exiting' : 'entering'}`}
              role="status"
            >
              <div className="toast-icon-wrap">
                {isError ? (
                  <AlertCircle size={18} className="toast-icon error" />
                ) : isInfo ? (
                  <Info size={18} className="toast-icon info" />
                ) : (
                  <CheckCircle2 size={18} className="toast-icon success" />
                )}
              </div>
              <div className="toast-message-content">
                <span className="toast-message-text">{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="btn-toast-close"
                title="Dismiss message"
                aria-label="Dismiss message"
              >
                <X size={15} />
              </button>
              {/* 3-second animated countdown bar */}
              <div
                className="toast-progress-bar"
                style={{ animationDuration: `${toast.duration || 3000}ms` }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

