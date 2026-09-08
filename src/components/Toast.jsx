/**
 * Toast — application-wide feedback system.
 *
 * ONE mechanism for all pages.  Every `useToast()` caller gets the same
 * `toast` function.  It accepts two calling conventions:
 *
 *   // 1. Plain string (most common, backwards-compatible):
 *   toast('Assignment created successfully.');
 *
 *   // 2. Object with explicit type / timeout:
 *   toast({ message: 'Something failed.', type: 'error' });
 *   toast({ message: 'Info.', type: 'info', timeout: 6000 });
 *
 * Types:  'success' (default)  |  'error'  |  'info'  |  'actionable'
 *
 * The provider renders a fixed top-right container so toasts are always
 * visible, never blocked by modals or the sidebar, and never interfere
 * with page content.
 */
import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

// ── Normalise any call shape into a full entry object ─────────────────────
function normalise(arg) {
  if (typeof arg === 'string') {
    return { message: arg, type: 'success' };
  }
  if (arg && typeof arg === 'object') {
    return {
      message: String(arg.message ?? ''),
      type: arg.type ?? 'success',
      timeout: arg.timeout,
      // Optional: a label shown below the message (used for notification toasts)
      sub: arg.sub ?? null,
      // Optional: callback invoked when the user clicks the toast body
      onClick: arg.onClick ?? null,
    };
  }
  return { message: String(arg ?? ''), type: 'success' };
}

// ── Icons ─────────────────────────────────────────────────────────────────
function SuccessIcon() {
  return (
    <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="toast-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  );
}

function DismissButton({ onClick }) {
  return (
    <button
      type="button"
      className="toast-dismiss"
      onClick={onClick}
      aria-label="Dismiss notification"
    >
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <line x1="1" y1="1" x2="13" y2="13" />
        <line x1="13" y1="1" x2="1" y2="13" />
      </svg>
    </button>
  );
}

// ── Single toast item ──────────────────────────────────────────────────────
function ToastItem({ entry, onDismiss }) {
  const { id, message, type, sub, onClick } = entry;

  const handleBodyClick = () => {
    if (onClick) onClick();
    onDismiss(id);
  };

  const Icon = type === 'error' ? ErrorIcon : type === 'info' ? InfoIcon : SuccessIcon;

  return (
    <div
      className={`toast-item toast-item--${type ?? 'success'}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div
        className={`toast-body${onClick ? ' toast-body--clickable' : ''}`}
        onClick={handleBodyClick}
        /* keyboard support for actionable toasts */
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBodyClick(); } } : undefined}
      >
        <Icon />
        <div className="toast-text">
          <span className="toast-message">{message}</span>
          {sub && <span className="toast-sub">{sub}</span>}
        </div>
      </div>
      <DismissButton onClick={() => onDismiss(id)} />
    </div>
  );
}

// ── Provider ───────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * `toast(string | object)` — the single entry point used by every page.
   *
   * Returns the generated id so callers can dismiss programmatically if
   * needed (optional — most callers ignore the return value).
   */
  const toast = useCallback((arg) => {
    const entry = normalise(arg);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { ...entry, id }]);

    const timeout = entry.timeout ?? (entry.type === 'error' ? 6000 : 4000);
    if (timeout > 0) {
      setTimeout(() => dismiss(id), timeout);
    }
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.length > 0 && (
        <div
          className="toast-container"
          aria-label="Notifications"
          /* Let screen readers announce items as they are added */
        >
          {toasts.map((entry) => (
            <ToastItem key={entry.id} entry={entry} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
