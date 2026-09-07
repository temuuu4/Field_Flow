// Login page — Phase 7 integration.
//
// Calls `useAuth().login()` which posts to `/api/auth/login`, updates the
// AuthContext with the safe user returned by the backend, and lets the
// route guard redirect the user into the operational application.

import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthInput, PasswordInput, AuthSubmitButton, FormError } from '../../components/auth';
import { useAuth } from '../../context/AuthContext';
import { hasErrors, validateLogin } from '../../utils/validation';
import { getDefaultRouteForRole } from '../../auth/roles';

const blankValues = { email: '', password: '' };

const safeNextPath = (candidate) => {
  if (typeof candidate !== 'string') return null;
  // Only allow internal paths that begin with `/` and don't contain `//`.
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return candidate;
};

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // After login we want to send the user to either the page they tried to
  // visit before being bounced (RequireAuth stashed it in location.state)
  // or their role-appropriate landing route. Either is safe; the role
  // landing is the safer default because it cannot accidentally land a
  // user on a page they don't have permission for.
  const intendedDestination = safeNextPath(location.state?.from);
  const registered = location.state?.registered === true;
  const [values, setValues] = useState(blankValues);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Render the form with a fresh React key on every mount so the browser
  // cannot carry a stale value from a previous navigation. Combined with
  // the `name="auth-email"` prefix in `AuthInput` and the per-form
  // `autoComplete="off"`, this prevents password managers from pre-filling
  // a previous email (e.g. `mekdes@…`) on first load.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    setFormKey((prev) => prev + 1);
  }, []);

  // Already-authenticated visitors shouldn't see it again. Bounce them
  // to their role-appropriate landing page.
  if (auth.authenticated && !auth.loading) {
    const target = intendedDestination || getDefaultRouteForRole(auth.user?.role);
    return <Navigate to={target} replace />;
  }

  const update = (field) => (event) => {
    const nextValue = event.target.value;
    setValues((prev) => ({ ...prev, [field]: nextValue }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError('');
    try {
      const user = await auth.login({ email: values.email.trim(), password: values.password });
      // Prefer the original intended destination (RequireAuth stashed it),
      // but always fall back to the role-appropriate landing route. The
      // role-based fallback protects against accidentally landing a
      // driver on `/users` etc. — those routes render an AccessDenied
      // view, but we prefer a clean redirect.
      const target = intendedDestination || getDefaultRouteForRole(user?.role);
      navigate(target, { replace: true });
    } catch (error) {
      // `api/client.js` already normalises backend errors to `ApiError`
      // with a `message` and a safe generic fallback. Never leak stack
      // traces or technical detail.
      setServerError(error?.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to FieldFlow"
      subtitle="Use the email address and password associated with your account."
      solo
      topLink={
        <Link to="/welcome" className="auth-card-home" aria-label="Back to FieldFlow home">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to FieldFlow
        </Link>
      }
      footer={
        <p className="auth-footer-text">
          Don't have an account?{' '}
          <Link to="/register" className="auth-link">Create one</Link>
        </p>
      }
    >
      <form key={`login-form-${formKey}`} className="auth-form" onSubmit={handleSubmit} noValidate autoComplete="off">
        <FormError error={serverError} />
        {registered && (
          <div className="auth-form-success" role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Your account was created. Sign in with your credentials.</span>
          </div>
        )}

        <AuthInput
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          inputMode="email"
          placeholder="you@example.com"
          required
          value={values.email}
          onChange={update('email')}
          disabled={submitting}
          error={errors.email}
        />

        <PasswordInput
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          value={values.password}
          onChange={update('password')}
          disabled={submitting}
          error={errors.password}
        />

        <AuthSubmitButton loading={submitting} loadingLabel="Signing in…">
          Sign in
        </AuthSubmitButton>

        <p className="auth-footnote">
          Trouble signing in? Contact your administrator.
        </p>
      </form>
    </AuthLayout>
  );
}