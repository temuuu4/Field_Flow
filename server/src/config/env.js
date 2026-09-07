import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '../../..');
const environmentFile = process.env.ENV_FILE
  ? path.resolve(process.env.cwd(), process.env.ENV_FILE)
  : path.join(projectRoot, '.env');

dotenv.config({ path: environmentFile });

const requiredEnvironment = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const positiveNumber = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
};

// Minimum length for JWT_SECRET. 32 bytes / 256 bits is the recommended minimum for HS256.
const MIN_JWT_SECRET_LENGTH = 32;

const validateJwtSecret = (secret) => {
  if (!secret) {
    throw new Error(
      'Missing required environment variable: JWT_SECRET. ' +
      'Set JWT_SECRET in the server environment to a cryptographically random string of at least 32 characters.',
    );
  }
  if (typeof secret !== 'string' || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be a string of at least ${MIN_JWT_SECRET_LENGTH} characters. ` +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }
  return secret;
};

// Accept JWT-style duration strings used by `jsonwebtoken#expiresIn`
// (e.g. "2h", "15m", "7d", "30s", "1000ms") as well as plain numeric strings
// treated as seconds. Reject anything else so misconfiguration fails fast at
// startup instead of silently producing insecure (or unparseable) tokens.
const DURATION_PATTERN = /^(\d+)\s*(ms|s|m|h|d)?$/i;

const validateJwtExpiresIn = (name, value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `${name} must be a non-empty string. Use a JWT-style duration like "2h", "15m", "7d", "30s" or "1000ms".`,
    );
  }
  const match = value.trim().match(DURATION_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid ${name}: "${value}". Use a JWT-style duration like "2h", "15m", "7d", "30s" or "1000ms".`,
    );
  }
  return value;
};

// Eagerly validate required authentication configuration so the server fails
// fast at startup instead of crashing later during a login request.
const jwtSecret = validateJwtSecret(process.env.JWT_SECRET);
const jwtExpiresIn = validateJwtExpiresIn('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN ?? '2h');
const refreshTokenExpiresIn = validateJwtExpiresIn(
  'REFRESH_TOKEN_EXPIRES_IN',
  process.env.REFRESH_TOKEN_EXPIRES_IN ?? '7d',
);

export const environment = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(requiredEnvironment('PORT', '5000')),
  mongodbUri: requiredEnvironment('MONGODB_URI'),
  mongodbDbName: requiredEnvironment('MONGODB_DB_NAME', 'fieldflow'),
  corsOrigin: requiredEnvironment('CORS_ORIGIN', 'https://localhost:5173'),
  locationHistoryRetentionDays: positiveNumber('LOCATION_HISTORY_RETENTION_DAYS', '180'),
  locationSampleIntervalSeconds: positiveNumber('LOCATION_SAMPLE_INTERVAL_SECONDS', '20'),
  locationSampleMinDistanceMeters: positiveNumber('LOCATION_SAMPLE_MIN_DISTANCE_METERS', '50'),
  recurringSchedulerIntervalSeconds: positiveNumber('RECURRING_SCHEDULER_INTERVAL_SECONDS', '60'),
  vapidSubject: process.env.VAPID_SUBJECT,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  auth: {
    jwtSecret,
    jwtAlgorithm: 'HS256',
    jwtExpiresIn,
    refreshTokenExpiresIn,
    bcryptRounds: positiveNumber('BCRYPT_ROUNDS', '12'),
    cookieName: process.env.AUTH_COOKIE_NAME ?? 'fieldflow_session',
    refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME ?? 'fieldflow_refresh',
    cookieSecure: process.env.AUTH_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE ?? 'lax',
    // Account lockout policy
    maxFailedLoginAttempts: positiveNumber('AUTH_MAX_FAILED_ATTEMPTS', '5'),
    lockoutMinutes: positiveNumber('AUTH_LOCKOUT_MINUTES', '15'),
  },
});
