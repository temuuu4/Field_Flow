import crypto from 'node:crypto';
import { ApiError } from '../errors/ApiError.js';
import { environment } from '../config/env.js';

// CSRF protection using the double-submit cookie pattern.
//
// Frontend clients that perform state-changing requests must:
//  1. Read the value of the `fieldflow_csrf` cookie (readable from JS).
//  2. Echo that value back in the `X-CSRF-Token` request header.
//
// The server compares the two; if they differ, the request is rejected.
//
// This middleware is mounted AFTER cookieParser and ONLY for state-changing
// methods. Safe methods (GET, HEAD, OPTIONS) are skipped.
//
// Pre-authentication endpoints (`POST /api/auth/register`, `POST /api/auth/login`
// and `POST /api/auth/refresh`) are explicitly skipped because they cannot
// have a CSRF cookie/header pair yet — the double-submit pattern requires the
// cookie to already exist. The threat model for these exempt endpoints:
//
//   - `/api/auth/register`  creates a new account; the only side-effect for an
//     unauthenticated cross-origin POST is a new account being created with
//     the attacker's chosen email — annoying but not an authentication
//     bypass. The endpoint is also protected by a per-IP rate limiter and
//     per-field strict validation.
//   - `/api/auth/login`     cannot leak credentials because no cookie is set
//     when validation fails (a dummy bcrypt runs to equalize timing).
//   - `/api/auth/refresh`   reads the refresh cookie but rotates it; the
//     refresh cookie is `HttpOnly` so cross-site scripts cannot read or
//     echo it. Cross-origin rotation is harmless to the legitimate user
//     since the original session continues to work until expiration.
//
//   Defense-in-depth for these endpoints is provided by:
//     - `SameSite=Lax` cookies (the browser refuses cross-site POSTs).
//     - Per-IP rate limiting (see `middleware/rateLimit.js`).
//     - The custom CORS handler (rejecting origins not in the allow-list).
//     - Strict input validation (rejecting malformed bodies).
//
// Development consideration: the csrf cookie is intentionally NOT httpOnly so
// JavaScript can read it. It is `SameSite=Lax` by default which also provides
// browser-enforced CSRF protection for top-level navigations. The double-submit
// header check is a defense-in-depth layer for cross-origin requests.

export const CSRF_COOKIE_NAME = 'fieldflow_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function ensureCsrfCookie(request, response, next) {
  // Issue a CSRF cookie if one isn't already present. The value is generated
  // using `crypto.randomBytes` for cryptographic strength, and the cookie's
  // `secure` flag is driven by the auth-cookie-secure configuration so the
  // CSRF cookie stays in sync with the rest of the authentication cookie
  // policy (HTTPS in production, plain HTTP permitted in development).
  if (!request.cookies?.[CSRF_COOKIE_NAME]) {
    const value = crypto.randomBytes(32).toString('base64url');
    response.cookie(CSRF_COOKIE_NAME, value, {
      httpOnly: false,
      secure: environment.auth.cookieSecure,
      sameSite: environment.auth.cookieSameSite,
      path: '/',
    });
  }
  next();
}

const matchesAny = (request, patterns) => {
  if (!patterns || patterns.length === 0) return false;
  const path = request.originalUrl ?? request.url ?? '';
  return patterns.some((pattern) => (typeof pattern === 'function' ? pattern(request) : pattern.test(path)));
};

export function csrfProtection(options = {}) {
  const skip = options.skip ?? [];
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }
    if (matchesAny(request, skip)) {
      next();
      return;
    }
    const cookieValue = request.cookies?.[CSRF_COOKIE_NAME];
    const headerValue = request.headers[CSRF_HEADER_NAME];
    if (!cookieValue || !headerValue || cookieValue !== headerValue) {
      next(new ApiError(403, 'CSRF validation failed'));
      return;
    }
    next();
  };
}

// Common security response headers. Lightweight, helmet-style; we intentionally
// do not pull in the `helmet` package to keep the dependency surface small.
//
// HSTS is only enabled when the server is running in production. Forcing HSTS
// in development over plain HTTP would either be ignored by browsers or break
// the local dev experience entirely.
export function securityHeaders(request, response, next) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-DNS-Prefetch-Control', 'off');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Minimal default CSP for the API surface. The frontend serves its own CSP.
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  );
  // Disable powerful browser features by default. The API does not render UI
  // and does not need geolocation/camera/mic/etc. from the browser. Values
  // listed here are explicitly denied; new features must be deliberately
  // re-enabled in the future.
  response.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  );
  if (process.env.NODE_ENV === 'production') {
    // 2 years, include subdomains, eligible for preload. Production must be
    // served over HTTPS; this header is a no-op over HTTP and we deliberately
    // omit it in non-production to avoid trapping developers in HSTS locally.
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
  next();
}