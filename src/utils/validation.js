// Frontend validation helpers for the authentication forms.
//
// These helpers exist purely to improve the user experience. They mirror the
// shape of the backend validators (`utils/userValidation.js` in the server)
// but are intentionally simpler — the backend remains the security
// authority and re-validates every field authoritatively.
//
// The backend caps and rules we mirror here:
//   - `firstName` / `lastName`     : 1–80 characters, trimmed
//   - `email`                      : matches the same regex the server uses
//   - `password`                   : 8–128 characters, ≤ 72 UTF-8 bytes
//                                    (bcrypt truncates after 72 bytes)
//
// The auth API client (`api/auth.js`) rejects fields outside these shapes
// with `Unexpected user field(s)`, so intentionally we do not validate
// anything that isn't exposed in the form.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MIN = 1;
export const NAME_MAX = 80;

// Same regex as `server/src/utils/userValidation.js#emailPattern`.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const trim = (value) => (typeof value === 'string' ? value.trim() : '');

export const validateRequired = (value, label) => {
  const next = trim(value);
  if (!next) return `${label} is required.`;
  return '';
};

export const validateName = (value, label) => {
  const next = trim(value);
  if (!next) return `${label} is required.`;
  if (next.length > NAME_MAX) return `${label} must not exceed ${NAME_MAX} characters.`;
  return '';
};

export const validateEmail = (value) => {
  const next = trim(value);
  if (!next) return 'Email is required.';
  if (!EMAIL_PATTERN.test(next)) return 'Please enter a valid email address.';
  return '';
};

export const validatePassword = (value) => {
  if (!value) return 'Password is required.';
  if (typeof value !== 'string') return 'Password must be a string.';
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Password must not exceed ${PASSWORD_MAX} characters.`;
  if (utf8ByteLength(value) > PASSWORD_MAX_BYTES) {
    return `Password must not exceed ${PASSWORD_MAX_BYTES} bytes when UTF-8 encoded.`;
  }
  return '';
};

// Mirror the backend's UTF-8 byte length check so we can show a clearer
// message than "internal server error" when a user submits a non-ASCII
// password that bcrypt would silently truncate.
const utf8ByteLength = (value) => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  // Best-effort fallback: count UTF-16 surrogate pairs (rare on real input).
  let length = 0;
  for (let i = 0; i < value.length; i += 1) {
    length += value.charCodeAt(i) > 0x7ff ? 3 : value.charCodeAt(i) > 0x7f ? 2 : 1;
  }
  return length;
};

// Convenience: run all field-level validators and return a map of field → error.
// An empty string means the field is valid.
export const validateLogin = (values) => ({
  email: validateEmail(values.email),
  password: validateRequired(values.password, 'Password'),
});

export const validateRegister = (values) => ({
  firstName: validateName(values.firstName, 'First name'),
  lastName: validateName(values.lastName, 'Last name'),
  email: validateEmail(values.email),
  password: validatePassword(values.password),
});

export const hasErrors = (errorMap) => Object.values(errorMap).some(Boolean);