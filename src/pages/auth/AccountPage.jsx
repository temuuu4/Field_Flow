// Account / settings page.
//
// Phase 9 surface. The page has two sections:
//
//   1. Account information — a read-only view sourced from `useAuth()`,
//      which itself comes from `/api/auth/me`. We never read
//      `passwordHash`, `tokenVersion`, or any other internal security
//      field here; the backend's safe-user projection already strips
//      them.
//
//   2. Change password — a form with `currentPassword`, `newPassword`,
//      and `confirmPassword` fields. On success, the backend invalidates
//      the existing session by bumping `tokenVersion` and does NOT
//      re-issue cookies. The frontend therefore clears the local
//      AuthContext user and navigates to `/login` so the next API call
//      isn't auto-refreshed against a now-invalidated session.
//
// Client-side validation is purely for UX; the backend performs all
// security checks authoritatively.

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, uname, when, present } from '../utils';
import { useAuth } from '../../context/AuthContext';
import { changePassword } from '../../api/auth';
import { FormError } from '../../components/auth';
import { SectionCard } from '../../components/ui';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { hasErrors, PASSWORD_MIN, PASSWORD_MAX, PASSWORD_MAX_BYTES } from '../../utils/validation';
import { roleLabel } from '../../auth/roles';

const blankValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

// Local form-level validation. The backend re-validates authoritatively
// (server-side `validateChangePassword` + bcrypt + tokenVersion).
const validateLocal = (values) => {
  const errors = {};
  if (!values.currentPassword) errors.currentPassword = 'Current password is required.';
  if (!values.newPassword) {
    errors.newPassword = 'New password is required.';
  } else {
    if (values.newPassword.length < PASSWORD_MIN) {
      errors.newPassword = `Password must be at least ${PASSWORD_MIN} characters.`;
    } else if (values.newPassword.length > PASSWORD_MAX) {
      errors.newPassword = `Password must not exceed ${PASSWORD_MAX} characters.`;
    } else if (new TextEncoder().encode(values.newPassword).length > PASSWORD_MAX_BYTES) {
      errors.newPassword = `Password must not exceed ${PASSWORD_MAX_BYTES} bytes when UTF-8 encoded.`;
    }
    if (values.newPassword === values.currentPassword) {
      errors.newPassword = 'New password must be different from the current password.';
    }
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Please confirm the new password.';
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'New password and confirmation do not match.';
  }
  return errors;
};

export default function AccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The login page sets `state.passwordChanged = true` after a successful
  // password change; surface that as a one-time banner if the user lands
  // here straight from the login page.
  const passwordChanged = location.state?.passwordChanged === true;
  const user = auth.user;

  const [values, setValues] = useState(blankValues);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(
    passwordChanged ? 'Your password was changed. Please sign in again with your new password.' : ''
  );

  // `present()` augments the AuthContext user with `name`, `initials`,
  // `color`, and `roleLabel` for the existing sidebar components.
  const presented = user ? present({ ...user, _id: user.id || user._id }) : null;

  const update = (field) => (event) => {
    const nextValue = event.target.value;
    setValues((prev) => ({ ...prev, [field]: nextValue }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    if (serverError) setServerError('');
    if (successMessage) setSuccessMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const localErrors = validateLocal(values);
    setErrors(localErrors);
    if (hasErrors(localErrors)) return;

    setSubmitting(true);
    setServerError('');
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // The backend incremented tokenVersion, invalidating this session.
      // The simplest correct path is to call auth.logout() and ignore
      // any 401 the backend returns (the session is already gone). The
      // local AuthContext user is cleared by logout() regardless.
      try { await auth.logout(); } catch (e) { /* expected: tokenVersion mismatch */ }
      // Replace current history entry so the back button cannot return
      // to the now-invalidated /account route.
      navigate('/login', {
        replace: true,
        state: { passwordChanged: true, from: undefined },
      });
    } catch (error) {
      setServerError(error?.message || 'Unable to change your password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    // The route guard prevents this, but defend against a transient
    // render before AuthContext has finished bootstrapping.
    return (
      <Page title="Account" u={null}>
        <SectionCard title="Account">
          <p>Loading your account…</p>
        </SectionCard>
      </Page>
    );
  }

  return (
    <Page title="Account" u={presented}>
      <SectionCard
        title="Account information"
        subtitle="Signed in as the authenticated user from the backend session."
      >
        <div className="account-info-grid">
          <div className="account-info-row">
            <span className="account-info-label">Name</span>
            <span className="account-info-value">{uname(user)}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">First name</span>
            <span className="account-info-value">{user.firstName || '—'}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">Last name</span>
            <span className="account-info-value">{user.lastName || '—'}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">Email</span>
            <span className="account-info-value">{user.email || '—'}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">Role</span>
            <span className="account-info-value">{roleLabel(user.role)}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">Status</span>
            <span className="account-info-value">
              <span className={'badge ' + (user.status === 'ACTIVE' ? 'badge-success' : 'badge-warning')}>
                {user.status || 'unknown'}
              </span>
            </span>
          </div>
          {user.lastLoginAt && (
            <div className="account-info-row">
              <span className="account-info-label">Last sign-in</span>
              <span className="account-info-value">{when(user.lastLoginAt)}</span>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Change password"
        subtitle="You'll be signed out and asked to sign in again with your new password."
      >
        <form className="auth-form" onSubmit={handleSubmit} noValidate autoComplete="off">
          <FormError error={serverError} />
          {successMessage && (
            <div className="auth-form-success" role="status" aria-live="polite">
              <span>{successMessage}</span>
            </div>
          )}

          <PasswordInput
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            required
            value={values.currentPassword}
            onChange={update('currentPassword')}
            disabled={submitting}
            error={errors.currentPassword}
          />
          <PasswordInput
            name="newPassword"
            label="New password"
            autoComplete="new-password"
            required
            value={values.newPassword}
            onChange={update('newPassword')}
            disabled={submitting}
            error={errors.newPassword}
            hint={'' + PASSWORD_MIN + ' to ' + PASSWORD_MAX + ' characters.'}
          />
          <PasswordInput
            name="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
            required
            value={values.confirmPassword}
            onChange={update('confirmPassword')}
            disabled={submitting}
            error={errors.confirmPassword}
          />

          <div className="account-submit-row">
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={submitting || !values.currentPassword || !values.newPassword || !values.confirmPassword}
            >
              {submitting
                ? <><span className="btn-spinner" aria-hidden="true" /> Changing password…</>
                : 'Change password'}
            </button>
          </div>
        </form>
      </SectionCard>
    </Page>
  );
}
