// Account / profile page.
//
// Available to every authenticated role. Shows the real user identity
// sourced exclusively from the authenticated backend session — no
// client-supplied values are trusted for display.
//
// Sections:
//
//   1. Profile header  — large avatar, full name, role badge, status
//   2. Account details — read-only info grid (email, phone, last login)
//   3. Edit profile    — IT_ADMIN only: firstName, lastName, phone
//                        (email deliberately excluded — email change is a
//                        sensitive operation; admins should do it via the
//                        Users management page which has full audit trails)
//                        Uses PATCH /api/users/:id which is admin-only on
//                        the backend. Non-admins see a read-only view.
//   4. Change password — all roles via PATCH /api/auth/password
//                        On success the session is invalidated and the
//                        user is redirected to /login.
//
// Security notes:
//   • All user data comes from AuthContext (which comes from /api/auth/me).
//   • No role, status, or internal security field is editable here.
//   • Role editing is intentionally absent — role changes must go through
//     the admin Users page (/users) which carries its own authorization.
//   • The PATCH /api/users/:id call is only reached when the caller is
//     IT_ADMIN; the backend enforces this independently.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Avatar, uname, when, present, fail } from '../utils';
import { useAuth } from '../../context/AuthContext';
import { changePassword } from '../../api/auth';
import { updateUser } from '../../api/users';
import { FormError } from '../../components/auth';
import { SectionCard } from '../../components/ui';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { useToast } from '../../components/Toast';
import { hasErrors, PASSWORD_MIN, PASSWORD_MAX, PASSWORD_MAX_BYTES } from '../../utils/validation';
import { roleLabel, ROLE } from '../../auth/roles';

// ── Password validation (same rules as the backend) ──────────────────────
const blankPwd = { currentPassword: '', newPassword: '', confirmPassword: '' };

const validatePassword = (values) => {
  const errors = {};
  if (!values.currentPassword) errors.currentPassword = 'Current password is required.';
  if (!values.newPassword) {
    errors.newPassword = 'New password is required.';
  } else if (values.newPassword.length < PASSWORD_MIN) {
    errors.newPassword = `Password must be at least ${PASSWORD_MIN} characters.`;
  } else if (values.newPassword.length > PASSWORD_MAX) {
    errors.newPassword = `Password must not exceed ${PASSWORD_MAX} characters.`;
  } else if (new TextEncoder().encode(values.newPassword).length > PASSWORD_MAX_BYTES) {
    errors.newPassword = `Password must not exceed ${PASSWORD_MAX_BYTES} bytes when UTF-8 encoded.`;
  } else if (values.newPassword === values.currentPassword) {
    errors.newPassword = 'New password must be different from the current password.';
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Please confirm the new password.';
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
};

// ── Role badge colour ─────────────────────────────────────────────────────
const ROLE_BADGE = {
  [ROLE.ADMIN]:    'badge-purple',
  [ROLE.OPERATOR]: 'badge-info',
  [ROLE.DRIVER]:   'badge-success',
};

// ── Larger avatar for the profile header ─────────────────────────────────
function ProfileAvatar({ u, size = 72 }) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: u?.color || '#665bd7',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: 'var(--font-heading)',
    fontSize: size * 0.36,
    fontWeight: 700,
    flexShrink: 0,
    userSelect: 'none',
    letterSpacing: '-0.02em',
  };
  return <span style={style} aria-hidden="true">{u?.initials || '?'}</span>;
}

// ── Edit profile form (IT_ADMIN only) ─────────────────────────────────────
function EditProfileForm({ user, presented, onSaved }) {
  const toast = useToast();
  const { setUser } = useAuth();
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName:  user.lastName  || '',
    phone:     user.phone     || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const update = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const errors = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim())  errors.lastName  = 'Last name is required.';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }

    setSubmitting(true);
    setServerError('');
    try {
      const updated = await updateUser(user.id || user._id, {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        phone:     form.phone.trim() || undefined,
      });
      // Propagate fresh user data into AuthContext so the header avatar
      // and sidebar update immediately without requiring a page reload.
      if (setUser) setUser(updated);
      onSaved?.();
      toast('Profile updated successfully.');
    } catch (err) {
      setServerError(err?.message || 'Unable to save your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="account-edit-form" onSubmit={handleSubmit} noValidate>
      <FormError error={serverError} />

      <div className="account-edit-row">
        <div className="account-edit-field">
          <label htmlFor="acct-firstName">First name</label>
          <input
            id="acct-firstName"
            type="text"
            value={form.firstName}
            onChange={update('firstName')}
            disabled={submitting}
            autoComplete="given-name"
            required
          />
          {fieldErrors.firstName && <p className="form-error">{fieldErrors.firstName}</p>}
        </div>
        <div className="account-edit-field">
          <label htmlFor="acct-lastName">Last name</label>
          <input
            id="acct-lastName"
            type="text"
            value={form.lastName}
            onChange={update('lastName')}
            disabled={submitting}
            autoComplete="family-name"
            required
          />
          {fieldErrors.lastName && <p className="form-error">{fieldErrors.lastName}</p>}
        </div>
      </div>

      <div className="account-edit-field">
        <label htmlFor="acct-phone">Phone (optional)</label>
        <input
          id="acct-phone"
          type="tel"
          value={form.phone}
          onChange={update('phone')}
          disabled={submitting}
          autoComplete="tel"
          placeholder="e.g. +1 555 000 0000"
        />
      </div>

      <div className="account-edit-hint">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 11a1 1 0 100 2 1 1 0 000-2zm.75-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>
        </svg>
        <span>Email and role changes must be performed by an administrator through the Users page.</span>
      </div>

      <div className="account-submit-row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting
            ? <><span className="btn-spinner" aria-hidden="true" /> Saving…</>
            : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

// ── Change password form (all roles) ─────────────────────────────────────
function ChangePasswordForm({ user }) {
  const toast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(blankPwd);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const local = validatePassword(values);
    setErrors(local);
    if (hasErrors(local)) return;

    setSubmitting(true);
    setServerError('');
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Backend bumped tokenVersion — this session is now invalid.
      // Logout clears local state, then send the user to /login.
      try { await logout(); } catch { /* expected — session already invalidated */ }
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setServerError(err?.message || 'Unable to change your password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const allFilled = values.currentPassword && values.newPassword && values.confirmPassword;

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate autoComplete="off">
      <FormError error={serverError} />

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
        hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`}
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
          disabled={submitting || !allFilled}
        >
          {submitting
            ? <><span className="btn-spinner" aria-hidden="true" /> Changing password…</>
            : 'Change password'}
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Page title="Account" u={null}>
        <SectionCard title="Account">
          <p>Loading your account…</p>
        </SectionCard>
      </Page>
    );
  }

  // `present()` adds name, initials, color, roleLabel for Avatar & sidebar.
  const presented = present({ ...user, _id: user.id || user._id });
  const isAdmin = user.role === ROLE.ADMIN;
  const roleBadgeClass = ROLE_BADGE[user.role] || 'badge-muted';

  return (
    <Page title="Account" u={presented}>

      {/* ── Profile header ──────────────────────────────────────────── */}
      <div className="acct-profile-header">
        <ProfileAvatar u={presented} size={80} />
        <div className="acct-profile-info">
          <h2 className="acct-profile-name">{uname(user)}</h2>
          <div className="acct-profile-meta">
            <span className={`badge ${roleBadgeClass}`}>{roleLabel(user.role)}</span>
            <span className={`badge ${user.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
              {user.status || 'unknown'}
            </span>
            {user.email && (
              <span className="acct-profile-email">{user.email}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Account details (read-only for everyone) ─────────────────── */}
      <SectionCard title="Account information">
        <div className="account-info-grid">
          <div className="account-info-row">
            <span className="account-info-label">Full name</span>
            <span className="account-info-value">{uname(user)}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">Email</span>
            <span className="account-info-value">{user.email || '—'}</span>
          </div>
          {user.phone && (
            <div className="account-info-row">
              <span className="account-info-label">Phone</span>
              <span className="account-info-value">{user.phone}</span>
            </div>
          )}
          <div className="account-info-row">
            <span className="account-info-label">Role</span>
            <span className="account-info-value">{roleLabel(user.role)}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">Status</span>
            <span className="account-info-value">
              <span className={`badge ${user.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
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
          {user.createdAt && (
            <div className="account-info-row">
              <span className="account-info-label">Account created</span>
              <span className="account-info-value">{when(user.createdAt)}</span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Edit profile (IT_ADMIN only) ──────────────────────────────── */}
      {isAdmin && (
        <SectionCard
          title="Edit profile"
          subtitle="Update your display name and contact phone. Email and role changes require the Users management page."
        >
          <EditProfileForm user={user} presented={presented} />
        </SectionCard>
      )}

      {/* ── Change password (all roles) ───────────────────────────────── */}
      <SectionCard
        title="Change password"
        subtitle="You will be signed out immediately after changing your password."
      >
        <ChangePasswordForm user={user} />
      </SectionCard>

    </Page>
  );
}
