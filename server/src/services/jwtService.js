import jwt from 'jsonwebtoken';
import { environment } from '../config/env.js';

// Centralized JWT service. Pinned algorithm, minimal payload, and helpers for
// issuing + verifying both access and refresh tokens.

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';

const baseOptions = {
  algorithm: environment.auth.jwtAlgorithm,
};

const buildPayload = ({ userId, role, tokenVersion, type }) => {
  // Keep payload minimal. Do NOT include email, passwordHash, or PII.
  // `tokenVersion` enables global session invalidation when bumped on logout-all
  // or password change.
  return { sub: userId, role, tv: tokenVersion, type };
};

export function signAccessToken({ userId, role, tokenVersion }) {
  return jwt.sign(
    buildPayload({ userId, role, tokenVersion, type: ACCESS_TOKEN_TYPE }),
    environment.auth.jwtSecret,
    { ...baseOptions, expiresIn: environment.auth.jwtExpiresIn },
  );
}

export function signRefreshToken({ userId, tokenVersion }) {
  return jwt.sign(
    buildPayload({ userId, role: undefined, tokenVersion, type: REFRESH_TOKEN_TYPE }),
    environment.auth.jwtSecret,
    { ...baseOptions, expiresIn: environment.auth.refreshTokenExpiresIn },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, environment.auth.jwtSecret, { algorithms: [environment.auth.jwtAlgorithm] });
}

export const tokenTypes = Object.freeze({
  ACCESS: ACCESS_TOKEN_TYPE,
  REFRESH: REFRESH_TOKEN_TYPE,
});
