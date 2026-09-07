const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
const baseUrl = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, '') : '';

// When the API is served from a different origin (VITE_API_BASE_URL is set)
// we need to send cookies cross-origin. The backend already allows the
// frontend origin via CORS_ORIGIN. When the API is on the same origin
// (proxy or production same-domain) `same-origin` is sufficient.
const credentialsMode = baseUrl ? 'include' : 'same-origin';

// Name of the CSRF cookie the backend issues via `ensureCsrfCookie`. We read
// it directly from document.cookie because the cookie is intentionally
// httpOnly: false so JavaScript can echo it back via the X-CSRF-Token
// header (double-submit pattern). The cookies that actually carry the
// authentication tokens (fieldflow_session / fieldflow_refresh) remain
// httpOnly and are never visible to JavaScript.
const CSRF_COOKIE_NAME = 'fieldflow_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

const readCsrfCookie = () => {
  if (typeof document === 'undefined') return '';
  const target = `${CSRF_COOKIE_NAME}=`;
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    if (part.startsWith(target)) return decodeURIComponent(part.slice(target.length));
  }
  return '';
};

// State-changing HTTP verbs must include the CSRF token. Safe methods do
// not — they are exempt in `server/src/middleware/security.js`.
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export class ApiError extends Error {
  constructor(message, { status, details, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.cause = cause;
  }
}

// AuthContext installs handlers here to be notified when an authenticated
// request fails with 401 (token expired/revoked). The handler is expected
// to attempt a session refresh and either retry the request or surface
// an `ApiError` to the caller with `status === 401` after clearing the
// session. We keep this a simple list of callbacks (rather than a single
// hard-coded refresh strategy) so the API client stays decoupled from the
// session implementation.
const unauthorizedHandlers = new Set();

export const onUnauthorized = (handler) => {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
};

const notifyUnauthorized = async (path, init) => {
  for (const handler of unauthorizedHandlers) {
    try {
      const result = await handler({ path, init });
      if (result && result.retry) return result.init ?? init;
    } catch (e) {
      // Handler errors fall through; the original 401 will be raised below.
    }
  }
  return null;
};

export async function request(path, { method = 'GET', body, headers, signal } = {}) {
  const url = baseUrl ? `${baseUrl}${path}` : path;

  // First attempt.
  const buildInit = () => {
    const init = {
      method,
      credentials: credentialsMode,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(MUTATING_METHODS.has(method) ? { [CSRF_HEADER_NAME]: readCsrfCookie() } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    };
    return init;
  };

  try {
    const response = await fetch(url, buildInit());
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      // Allow the AuthContext to attempt a single refresh + retry before
      // we surface the error to the caller. This guarantees the refresh
      // endpoint itself can never recursively refresh (the path guard
      // excludes /api/auth/*).
      const retriedInit = await notifyUnauthorized(path, buildInit());
      if (retriedInit) {
        const retryResponse = await fetch(url, retriedInit);
        return handleResponse(retryResponse);
      }
    }
    return handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Fetch rejects only for transport failures. Keep implementation and
    // infrastructure details out of the field-facing UI.
    throw new ApiError('FieldFlow cannot reach the server. Check your connection and try again.', { cause: error });
  }
}

const handleResponse = async (response) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      details: payload?.details,
    });
  }
  return payload.data;
};

export const apiBaseUrl = baseUrl;
