/**
 * AdminModal — shared modal shell used by all four admin creation forms.
 *
 * Provides:
 *   • modal-overlay  (backdrop, closes on outside-click)
 *   • modal          (container, max-width 640px)
 *   • modal-header   (title + close button)
 *   • optional error banner
 *   • modal-body     (scrollable, contains children)
 *
 * The footer with action buttons is rendered by each child form so that
 * button labels stay specific to the entity being created.
 *
 * Props:
 *   title    {string}   – heading shown in the modal header
 *   onClose  {fn}       – called when the user dismisses the modal
 *   error    {string}   – top-level form error (shown in the error banner)
 *   children {node}     – form content (fields + footer)
 *   labelId  {string}   – id for aria-labelledby (optional, defaults to auto)
 */
export default function AdminModal({ title, onClose, error, children, labelId }) {
  const headingId = labelId || 'admin-modal-title';

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        className="modal admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id={headingId}>{title}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label={`Close ${title} modal`}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Error banner — only shown when there is an error */}
          {error && (
            <div className="modal-error-banner" role="alert">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
