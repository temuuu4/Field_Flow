// Full-screen loading view rendered while the AuthContext bootstraps via
// `/api/auth/me`. Matches the visual style of the Login/Register cards so
// the application does not flash the unauthenticated login screen briefly
// while a real session is being restored.

import { AuthLayout } from './AuthLayout';

export function AuthLoadingScreen() {
  return (
    <AuthLayout title="FieldFlow" subtitle="Checking your session…">
      <div className="auth-loading" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p className="auth-loading-text">Verifying your session…</p>
        <p className="auth-footnote">If this takes too long, refresh the page or contact your administrator.</p>
      </div>
    </AuthLayout>
  );
}