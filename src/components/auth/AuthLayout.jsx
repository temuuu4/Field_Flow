// Layout wrapper for the authentication screens.
//
// Provides a balanced two-column composition on desktop: a left brand
// panel (≈45% of the viewport) and a right authentication panel (≈55%).
// On tablet the brand panel collapses into a slim header strip; on
// mobile it is hidden so the form owns the full width.
//
// The brand panel is React-driven: a small set of "operational
// indicator" cards rotate periodically to give the screen a sense of
// life without becoming distracting. All animations respect
// `prefers-reduced-motion` via CSS.

import { useEffect, useState } from 'react';

const BRAND_INDICATORS = [
  {
    id: 'gps',
    label: 'Live journey tracking',
    value: 'streaming',
    detail: 'Driver location updated every few seconds',
  },
  {
    id: 'barcode',
    label: 'Sample collection',
    value: 'scanning',
    detail: 'Barcode-driven intake from the field',
  },
  {
    id: 'role',
    label: 'Role-based access',
    value: 'secured',
    detail: 'Drivers, operators, IT administrators',
  },
  {
    id: 'sync',
    label: 'Offline-tolerant sync',
    value: 'resilient',
    detail: 'Pending events replay when reconnected',
  },
];

export function AuthLayout({ title, subtitle, footer, children, solo = false, topLink = null, wide = false }) {
  // Rotate the active operational indicator so the brand panel reads
  // as a live, animated system without any user-driven input.
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (solo) return undefined;
    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % BRAND_INDICATORS.length);
    }, 4200);
    return () => clearInterval(id);
  }, [solo]);

  const active = BRAND_INDICATORS[activeIndex];

  return (
    <div className={`auth-screen${solo ? ' auth-screen--solo' : ''}`}>
      <aside className="auth-brand-panel" aria-label="FieldFlow product overview">
        <div className="auth-brand-bg" aria-hidden="true">
          <span className="auth-brand-orb auth-brand-orb--a" />
          <span className="auth-brand-orb auth-brand-orb--b" />
        </div>
        <div className="auth-brand-inner">
          <div className="auth-brand-mark-row">
            <div className="auth-brand-mark" aria-hidden="true">
              <span className="auth-brand-mark-dot" />
            </div>
            <span className="auth-brand-wordmark">FieldFlow</span>
          </div>
          <h1 className="auth-brand-title">
            Barcode sample collection and live location tracking for field operations teams.
          </h1>
          <ul className="auth-brand-points">
            <li><span className="auth-brand-bullet" aria-hidden="true" />Role-based assignments for drivers and operators</li>
            <li><span className="auth-brand-bullet" aria-hidden="true" />Live journey and GPS tracking</li>
            <li><span className="auth-brand-bullet" aria-hidden="true" />Barcode-driven sample collection and review</li>
          </ul>

          <div className="auth-brand-status" role="status" aria-live="polite">
            <div className={`auth-brand-status-card auth-brand-status-card--${active.id}`}>
              <div className="auth-brand-status-head">
                <span className="auth-brand-status-pulse" aria-hidden="true" />
                <span className="auth-brand-status-label">{active.label}</span>
                <span className="auth-brand-status-value">{active.value}</span>
              </div>
              <p className="auth-brand-status-detail">{active.detail}</p>
              <div className="auth-brand-status-dots" aria-hidden="true">
                {BRAND_INDICATORS.map((ind, idx) => (
                  <span
                    key={ind.id}
                    className={`auth-brand-status-dot ${idx === activeIndex ? 'is-active' : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className={`auth-card${wide ? ' auth-card--wide' : ''}`}>
          {topLink && (
            <div className="auth-card-home-row">
              {topLink}
            </div>
          )}
          <div className="auth-card-header">
            <div className="auth-brand-row">
              <span className="auth-brand-mark auth-brand-mark--small" aria-hidden="true">
                <span className="auth-brand-mark-dot" />
              </span>
              <span className="auth-brand-name">FieldFlow</span>
            </div>
            <h2 className="auth-card-title">{title}</h2>
            {subtitle && <p className="auth-card-subtitle">{subtitle}</p>}
          </div>
          <div className="auth-card-body">{children}</div>
          {footer && <div className="auth-card-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}