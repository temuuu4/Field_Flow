/**
 * CreateUserModal
 *
 * Modal for creating a new user.
 * Uses the shared AdminModal shell for consistent chrome.
 *
 * Props:
 *   onClose   {fn}  – close the modal
 *   onCreated {fn}  – called after successful creation
 */
import { useState } from 'react';
import AdminModal from './AdminModal';
import { Button, FormField } from './ui';
import { createUser } from '../api/users';
import { fail } from '../pages/utils';

const ROLES = [
  { value: 'DRIVER', label: 'Driver' },
  { value: 'OPERATOR', label: 'Operations Admin' },
  { value: 'IT_ADMIN', label: 'IT Administrator' },
];

const blank = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'DRIVER',
  password: '',
  confirmPassword: '',
};

export default function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errors = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!form.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Enter a valid email address.';
    }
    if (!form.password) {
      errors.password = 'Password is required.';
    } else if (form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    if (form.confirmPassword !== form.password) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!form.role) errors.role = 'Role is required.';

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Please fix the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      await createUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        password: form.password,
      });
      onCreated?.();
      onClose();
    } catch (x) {
      setError(fail(x));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminModal title="Create user" onClose={onClose} error={error} labelId="create-user-title">
      <form className="modal-form-grid" onSubmit={handleSubmit}>
        {/* Name row */}
        <FormField label="First name" error={fieldErrors.firstName}>
          <input
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            placeholder="Jane"
            autoFocus
            autoComplete="given-name"
          />
        </FormField>

        <FormField label="Last name" error={fieldErrors.lastName}>
          <input
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            placeholder="Smith"
            autoComplete="family-name"
          />
        </FormField>

        {/* Email */}
        <div className="modal-full-row">
          <FormField label="Email address" error={fieldErrors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane.smith@example.com"
              autoComplete="email"
            />
          </FormField>
        </div>

        {/* Phone + Role */}
        <FormField label="Phone (optional)">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+1 555 000 0000"
            autoComplete="tel"
          />
        </FormField>

        <FormField label="Role" error={fieldErrors.role}>
          <select value={form.role} onChange={(e) => set('role', e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </FormField>

        {/* Password */}
        <FormField label="Password" error={fieldErrors.password}>
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Confirm password" error={fieldErrors.confirmPassword}>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => set('confirmPassword', e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
          />
        </FormField>

        {/* Footer */}
        <div className="modal-footer modal-full-row">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
