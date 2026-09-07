// Registration page — Phase 7 integration.
//
// Public registration creates a DRIVER account per the backend allow-list.
// The backend does NOT auto-login on registration; the user is redirected
// to /login after the account is created so they explicitly authenticate.

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthInput, PasswordInput, AuthSubmitButton, FormError } from '../../components/auth';
import { useAuth } from '../../context/AuthContext';
import { hasErrors, validateRegister, NAME_MAX } from '../../utils/validation';
import { getDefaultRouteForRole } from '../../auth/roles';

const blankValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
};

export default function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(blankValues);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already-authenticated visitors shouldn't see the registration page.
  // Direct them to their role-appropriate landing page.
  if (auth.authenticated && !auth.loading) {
    return <Navigate to={getDefaultRouteForRole(auth.user?.role)} replace />;
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

    const nextErrors = validateRegister(values);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError('');
    try {
      await auth.register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      // Registration succeeded. The backend does not auto-login (no session
      // cookies are set by /register). Redirect to /login so the user
      // explicitly signs in with their new credentials.
      navigate('/login', {
        replace: true,
        state: { registered: true },
      });
    } catch (error) {
      setServerError(error?.message || 'Unable to create the account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your FieldFlow account"
      subtitle="Driver accounts are created here. Operators and IT admins are provisioned by an administrator."
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
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate autoComplete="off">
        <FormError error={serverError} />

        <div className="auth-name-row">
          <AuthInput
            label="First name"
            name="firstName"
            autoComplete="given-name"
            placeholder="your first name"
            required
            maxLength={NAME_MAX}
            value={values.firstName}
            onChange={update('firstName')}
            disabled={submitting}
            error={errors.firstName}
          />
          <AuthInput
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            placeholder="your last name"
            required
            maxLength={NAME_MAX}
            value={values.lastName}
            onChange={update('lastName')}
            disabled={submitting}
            error={errors.lastName}
          />
        </div>

        <AuthInput
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          inputMode="email"
          placeholder="your email address"
          required
          value={values.email}
          onChange={update('email')}
          disabled={submitting}
          error={errors.email}
        />

        <PasswordInput
          name="password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          value={values.password}
          onChange={update('password')}
          disabled={submitting}
          error={errors.password}
          hint="8–128 characters. Avoid reusing passwords from other sites."
        />

        <AuthSubmitButton loading={submitting} loadingLabel="Creating account…">
          Create account
        </AuthSubmitButton>

        <p className="auth-footnote">
          By creating an account you agree to follow your organisation's
          acceptable-use policy.
        </p>
      </form>
    </AuthLayout>
  );
}