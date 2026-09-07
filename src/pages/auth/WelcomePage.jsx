// Public welcome / landing page.
//
// Reached at `/welcome`. This is the professional FieldFlow landing page —
// distinct from any loading state. It presents the product value
// proposition and two clear CTAs: Sign in or Create an account.

import { Link } from 'react-router-dom';
import { AuthLayout } from '../../components/auth';

const FEATURES = [
  {
    icon: '📍',
    title: 'Live GPS tracking',
    detail: 'Real-time driver location streaming so dispatchers always know fleet status.',
  },
  {
    icon: '📋',
    title: 'Role-based assignments',
    detail: 'Drivers, operators, and IT administrators each see only the tools they need.',
  },
  {
    icon: '🧪',
    title: 'Barcode sample collection',
    detail: 'Scan a barcode and the right sample record is created automatically.',
  },
  {
    icon: '🛣️',
    title: 'Route & stop management',
    detail: 'Plan landmark routes, assign stops, and track progress in real time.',
  },
  {
    icon: '🔔',
    title: 'Instant notifications',
    detail: 'Assignment updates, journey events, and sample status changes delivered immediately.',
  },
  {
    icon: '📡',
    title: 'Offline-tolerant sync',
    detail: 'Pending events queue locally and replay when the connection returns.',
  },
];

export default function WelcomePage() {
  return (
    <AuthLayout title="Welcome to FieldFlow" subtitle="Field operations, simplified." solo wide>
      <div className="welcome">
        <div className="welcome-hero">
          <div className="welcome-hero-icon" aria-hidden="true">
            <span className="welcome-hero-dot" />
          </div>
          <h1 className="welcome-hero-title">FieldFlow</h1>
          <p className="welcome-hero-subtitle">
            Barcode sample collection and live location tracking for field operations teams.
          </p>
        </div>

        <div className="welcome-features">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="welcome-feature">
              <span className="welcome-feature-icon" aria-hidden="true">{feature.icon}</span>
              <div className="welcome-feature-content">
                <h3 className="welcome-feature-title">{feature.title}</h3>
                <p className="welcome-feature-detail">{feature.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="welcome-cta">
          <Link to="/login" className="btn btn-primary btn-lg welcome-btn-primary">
            Sign in
          </Link>
          <Link to="/register" className="btn btn-secondary btn-lg welcome-btn-secondary">
            Create account
          </Link>
        </div>

        <p className="welcome-footnote">
          Operator and IT administrator accounts are provisioned by your administrator.
        </p>
      </div>
    </AuthLayout>
  );
}
