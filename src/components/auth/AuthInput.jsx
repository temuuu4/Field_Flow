// Reusable text input for the authentication forms.
//
// Renders a labeled, accessible input that integrates with the existing
// `.field`, `.form-error`, and `.form-hint` CSS classes. The component is
// deliberately controlled — the parent owns the value so it can validate
// before submission and pass the value to the API client.

import { useId, useState } from 'react';

export function AuthInput({
  label,
  type = 'text',
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  required = false,
  disabled = false,
  error = '',
  hint,
  inputMode,
  maxLength,
  spellCheck = false,
}) {
  const reactId = useId();
  const fieldId = name ? `auth-${name}` : reactId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint && !error ? `${fieldId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  // Start `readOnly` so browser/password-manager autofill cannot pre-fill
  // a stale saved value (e.g. `mekdes@fieldflow.demo`). The first focus
  // / click clears the flag so the user can type; tracking it in state
  // lets React re-renders preserve the cleared state.
  const [readOnly, setReadOnly] = useState(true);
  const onFocusRemoveReadOnly = () => setReadOnly(false);

  return (
    <div className={`auth-field ${error ? 'auth-field--invalid' : ''}`}>
      <label htmlFor={fieldId} className="auth-label">
        {label}
        {required && <span aria-hidden="true" className="auth-required">*</span>}
      </label>
      <div className="auth-input-wrapper">
        <input
          id={fieldId}
          // Non-standard `name` prefix prevents password-manager autofill
          // from pre-populating a previous email (e.g. `mekdes@…`);
          // `autoComplete` is set explicitly so real managers still
          // discover the field.
          name={name ? `auth-${name}` : name}
          type={type}
          value={value ?? ''}
          onChange={onChange}
          autoComplete={autoComplete ?? 'off'}
          data-lpignore="true"
          data-form-type="other"
          data-1p-ignore="true"
          readOnly={readOnly}
          onFocus={onFocusRemoveReadOnly}
          onMouseDown={onFocusRemoveReadOnly}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          inputMode={inputMode}
          maxLength={maxLength}
          spellCheck={spellCheck}
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          aria-required={required ? 'true' : 'false'}
          className="auth-input"
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="auth-hint">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="auth-error" role="alert">{error}</p>
      )}
    </div>
  );
}