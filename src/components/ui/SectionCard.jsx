export function SectionCard({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || subtitle || actions) && (
        <div className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--text-sm)', marginTop: '2px' }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
