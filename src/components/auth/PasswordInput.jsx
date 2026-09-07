// Password input with a visibility toggle. Built on top of `AuthInput` so the
// label/error/hint/aria wiring stays consistent. The toggle is a real
// `<button type="button">` (so it never submits the form), it does NOT clear
// the value, and it preserves focus when revealed/hidden.

import { useId, useState } from 'react';
import { AuthInput } from './AuthInput';

export function PasswordInput({
  name = 'password',
  label = 'Password',
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder,
  required = false,
  disabled = false,
  error = '',
  hint,
  maxLength = 128,
}) {
  const [visible, setVisible] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const reactId = useId();
  const toggleId = `${name || reactId}-toggle`;

  return (
    <div className={`auth-field ${error ? 'auth-field--invalid' : ''}`}>
      <label htmlFor={`auth-${name}`} className="auth-label">
        {label}
        {required && <span aria-hidden="true" className="auth-required">*</span>}
      </label>
      <div className="auth-input-wrapper">
        <input
          id={`auth-${name}`}
          // Non-standard `name` so password managers don't pre-fill a
          // stale value. `autoComplete` is set explicitly to the right
          // semantic so well-behaved managers still discover the field.
          name={name ? `auth-${name}` : name}
          type={visible ? 'text' : 'password'}
          value={value ?? ''}
          onChange={onChange}
          autoComplete={autoComplete}
          data-lpignore="true"
          data-form-type="other"
          data-1p-ignore="true"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          readOnly={readOnly}
          onFocus={() => setReadOnly(false)}
          onMouseDown={() => setReadOnly(false)}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `auth-${name}-error` : undefined}
          aria-required={required ? 'true' : 'false'}
          className="auth-input auth-input--with-suffix"
        />
        <button
          id={toggleId}
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={`auth-${name}`}
          className="auth-suffix-button"
        >
          {visible ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && !error && <p className="auth-hint">{hint}</p>}
      {error && (
        <p id={`auth-${name}-error`} className="auth-error" role="alert">{error}</p>
      )}
    </div>
  );
}