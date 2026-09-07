export function Notice({ error, message, className = '' }) {
  if (!error && !message) return null;
  return (
    <div className={`${className}`} style={{ marginBottom: 'var(--space-4)' }}>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
    </div>
  );
}
