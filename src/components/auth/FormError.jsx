// Server-level error display for the authentication forms.
//
// Distinct from per-field errors (which live next to the input). This banner
// is for top-level messages such as "Invalid email or password" that the
// backend intentionally hides user-enumeration details behind.

export function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="auth-form-error" role="alert" aria-live="polite">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{error}</span>
    </div>
  );
}