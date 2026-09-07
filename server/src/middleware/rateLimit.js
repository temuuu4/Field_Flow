// Minimal in-memory rate limiter. The project deliberately avoids Redis to
// keep the deployment footprint small, so we use a per-IP token bucket stored
// in process memory. This is intentionally scoped to authentication endpoints
// where the abuse vector (credential stuffing, account enumeration) is real.
//
// NOTE: an in-memory limiter is sufficient for a single-node deployment. In a
// horizontally scaled deployment each node would have its own counter and an
// attacker could rotate through nodes to multiply their budget; in that case
// move to a shared store (Redis) behind the same interface. The exported
// `createRateLimiter` API makes that swap a one-line change.

import { ApiError } from '../errors/ApiError.js';

const buckets = new Map();

const getClientKey = (request) => {
  // `request.ip` reflects the client IP given Express's trust-proxy setting.
  // When running behind a reverse proxy, configure `app.set('trust proxy', ...)`
  // so this is the real client IP and not the proxy.
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  return `${request.method}:${request.baseUrl || ''}${request.path}:${ip}`;
};

const sweepIfNeeded = () => {
  if (buckets.size < 1000) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill >= bucket.windowMs * 4) {
      buckets.delete(key);
    }
  }
};

export function createRateLimiter({
  windowMs = 60 * 1000,
  max = 30,
  message = 'Too many requests. Please try again later.',
  keyGenerator = getClientKey,
} = {}) {
  return (request, response, next) => {
    const key = keyGenerator(request);
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: max, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= windowMs) {
      // Refill window: reset to full so a slow caller can always recover
      // after one window of silence. Simple "fixed window" semantics — good
      // enough for protecting /api/auth endpoints from credential stuffing
      // and enumeration without surprising legitimate users.
      bucket.tokens = max;
      bucket.lastRefill = now;
    }
    if (bucket.tokens <= 0) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - bucket.lastRefill)) / 1000);
      response.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      next(new ApiError(429, message));
      return;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    sweepIfNeeded();
    next();
  };
}

// Pre-tuned limiters for the authentication surface. All values are derived
// from centralized environment configuration so they can be tuned without
// touching code; defaults are intentionally generous for normal use and
// restrictive enough to make credential stuffing impractical.
export const authRateLimiters = Object.freeze({
  // /api/auth/login: per-IP protection against online brute force. The
  // account-level lockout still kicks in once the account reaches
  // AUTH_MAX_FAILED_ATTEMPTS, so this is the broader guard.
  login: createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.AUTH_LOGIN_RATE_PER_MINUTE) || 10,
    message: 'Too many login attempts. Please slow down and try again in a minute.',
  }),
  // /api/auth/register: prevents mass account creation from a single source.
  register: createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.AUTH_REGISTER_RATE_PER_MINUTE) || 5,
    message: 'Too many registration attempts. Please try again in a minute.',
  }),
  // /api/auth/refresh: keeps the rotation endpoint from being abused as a
  // free high-throughput authenticated API surface.
  refresh: createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.AUTH_REFRESH_RATE_PER_MINUTE) || 30,
    message: 'Too many refresh requests. Please try again in a minute.',
  }),
  // /api/auth/password: per-IP guard against online password-guessing.
  // Each request requires a valid current-password check, so this is
  // mostly defensive — the bcrypt cost is the real work factor — but it
  // prevents an attacker who knows a valid current password from
  // hammering the endpoint to brute-force the new one.
  password: createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.AUTH_PASSWORD_RATE_PER_MINUTE) || 10,
    message: 'Too many password-change attempts. Please slow down and try again in a minute.',
  }),
});