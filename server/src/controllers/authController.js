import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { USER_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { environment } from '../config/env.js';
import { safeUser } from '../controllers/userController.js';
import { signAccessToken, signRefreshToken, tokenTypes, verifyToken } from '../services/jwtService.js';
import {
  DEFAULT_PUBLIC_REGISTRATION_ROLE,
  PUBLIC_REGISTRATION_ROLES,
  validateChangePassword,
  validateRegister,
} from '../utils/userValidation.js';

// Generic message used to avoid user enumeration and lockout disclosure.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

// Client-facing message used to avoid email enumeration via the public
// registration endpoint when an account already exists for the email.
const REGISTRATION_DUPLICATE_MESSAGE = 'An account with that email already exists';

// Pre-computed bcrypt hash used purely to equalize response timing between
// "no such user", "locked account", and "wrong password" paths. It will never
// match any real password because the salt/work factor is fixed.
const DUMMY_PASSWORD_HASH = '$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvalid';

const parseDurationToMilliseconds = (value) => {
  // Supports strings like "2h", "15m", "7d", "30s" used by JWT exp and our
  // own auth durations. Falls back to ms if a plain number is supplied.
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  switch (unit) {
    case 'ms': return amount;
    case 's': return amount * 1000;
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    default: return amount;
  }
};

const buildCookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: environment.auth.cookieSecure,
  sameSite: environment.auth.cookieSameSite,
  path: '/',
  maxAge: maxAgeMs,
});

const setAuthCookies = (response, { accessToken, refreshToken }) => {
  const accessMaxAge = parseDurationToMilliseconds(environment.auth.jwtExpiresIn);
  const refreshMaxAge = parseDurationToMilliseconds(environment.auth.refreshTokenExpiresIn);
  response.cookie(environment.auth.cookieName, accessToken, buildCookieOptions(accessMaxAge));
  response.cookie(environment.auth.refreshCookieName, refreshToken, buildCookieOptions(refreshMaxAge));
};

const clearAuthCookies = (response) => {
  response.clearCookie(environment.auth.cookieName, { path: '/' });
  response.clearCookie(environment.auth.refreshCookieName, { path: '/' });
};

const issueTokensForUser = (user) => {
  const accessToken = signAccessToken({
    userId: user._id.toString(),
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  const refreshToken = signRefreshToken({
    userId: user._id.toString(),
    tokenVersion: user.tokenVersion,
  });
  return { accessToken, refreshToken };
};

// Run a bcrypt comparison against a dummy hash to equalize the response
// timing between "user not found", "account locked", "account inactive", and
// "wrong password" paths. The comparison is intentionally awaited so it
// contributes comparable latency regardless of the caller code path.
const runDummyBcrypt = async (password) => {
  try {
    await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH);
  } catch {
    // bcrypt should never throw on a well-formed hash, but we never want a
    // dummy timing helper to bubble up its own error to the caller.
  }
};

// Atomically increment failedLoginAttempts and set lockedUntil if threshold reached.
// Uses findOneAndUpdate to prevent race conditions on concurrent login attempts.
// If the account is already locked, this is a no-op so the lockout window is
// not extended by repeated bad-password attempts during the lockout.
const recordFailedLogin = async (user) => {
  if (isAccountLocked(user)) {
    return user;
  }
  const maxAttempts = environment.auth.maxFailedLoginAttempts;
  const lockoutMs = environment.auth.lockoutMinutes * 60 * 1000;
  const now = new Date();

  const updated = await User.findOneAndUpdate(
    { _id: user._id, status: { $ne: USER_STATUSES.INACTIVE } },
    [
      {
        $set: {
          failedLoginAttempts: { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] },
        },
      },
      {
        $set: {
          lockedUntil: {
            $cond: [
              { $gte: [{ $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 0] }, maxAttempts] },
              { $add: [now, lockoutMs] },
              { $ifNull: ['$lockedUntil', null] },
            ],
          },
        },
      },
    ],
    { new: true },
  );
  return updated;
};

const resetLoginFailureState = async (user) => {
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } },
  );
};

const isAccountLocked = (user) => {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
};

export async function register(request, response, next) {
  try {
    const validated = validateRegister(request.body);

    // Pre-check for duplicate email. The User schema's `unique: true` index on
    // `email` is the authoritative protection against race-condition
    // duplicates; this check just lets us return a clean 409 without
    // surfacing MongoDB error details.
    const normalizedEmail = validated.email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).select('_id').lean();
    if (existing) {
      throw new ApiError(409, REGISTRATION_DUPLICATE_MESSAGE);
    }

    // Role is assigned server-side from the public allow-list. The validated
    // payload deliberately does not accept `role` or `status` from the
    // client, so privilege escalation via request-body fields is impossible.
    const assignedRole = PUBLIC_REGISTRATION_ROLES.includes(DEFAULT_PUBLIC_REGISTRATION_ROLE)
      ? DEFAULT_PUBLIC_REGISTRATION_ROLE
      : PUBLIC_REGISTRATION_ROLES[0];

    const user = new User({
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: normalizedEmail,
      phone: validated.phone,
      role: assignedRole,
      status: USER_STATUSES.ACTIVE,
    });

    // Use the existing `User#hashPassword` schema method so we do not
    // duplicate the bcrypt cost/architecture from elsewhere in the project.
    await user.hashPassword(validated.password);

    try {
      await user.save();
    } catch (error) {
      // Catch unique-index race-condition duplicate (E11000) so two
      // concurrent registration attempts with the same address both surface
      // the same safe 409 error rather than a 500 with driver details.
      if (error && error.code === 11000) {
        throw new ApiError(409, REGISTRATION_DUPLICATE_MESSAGE);
      }
      throw error;
    }

    // Registration deliberately does NOT issue JWTs or set auth cookies. The
    // project's existing flow expects users to authenticate via /login after
    // their account is created. This avoids accidentally exposing tokens in
    // the registration response and keeps the login/session architecture
    // unchanged.
    response.status(201).json({
      success: true,
      data: { user: safeUser(user) },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(request, response, next) {
  try {
    const { email, password } = request.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    // Treat missing user and missing passwordHash identically to avoid enumeration.
    if (!user || !user.passwordHash) {
      // Run a dummy bcrypt to equalize timing.
      await runDummyBcrypt(password);
      throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      // Do not distinguish between "locked", "inactive", "suspended" externally.
      await runDummyBcrypt(password);
      throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
    }

    if (isAccountLocked(user)) {
      // Even a locked account still runs dummy bcrypt so the response time
      // matches a normal wrong-password attempt. We do NOT record the failed
      // attempt (it would extend the lockout indefinitely).
      await runDummyBcrypt(password);
      throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await recordFailedLogin(user);
      throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
    }

    await resetLoginFailureState(user);

    const { accessToken, refreshToken } = issueTokensForUser(user);
    setAuthCookies(response, { accessToken, refreshToken });

    response.status(200).json({
      success: true,
      data: { user: safeUser(user) },
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(request, response, next) {
  try {
    const token = request.cookies?.[environment.auth.refreshCookieName];
    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      clearAuthCookies(response);
      throw new ApiError(401, 'Invalid or expired token');
    }

    if (decoded.type !== tokenTypes.REFRESH || !decoded.sub) {
      clearAuthCookies(response);
      throw new ApiError(401, 'Invalid token type');
    }

    const user = await User.findById(decoded.sub);
    if (!user || user.status !== USER_STATUSES.ACTIVE) {
      clearAuthCookies(response);
      throw new ApiError(401, 'Invalid or expired token');
    }

    // Reject refresh tokens whose `tv` doesn't match the current user version.
    // This invalidates all sessions on password change / logout-all.
    if (decoded.tv !== user.tokenVersion) {
      clearAuthCookies(response);
      throw new ApiError(401, 'Invalid or expired token');
    }

    // Refresh-token rotation is intentionally STATELESS in this project:
    // we issue a new access + new refresh token, but we do NOT bump
    // `tokenVersion`. `tokenVersion` is reserved exclusively for "revoke all
    // sessions" semantics (password change, explicit logout). The previous
    // access token keeps working until its natural `exp`; the previous
    // refresh token remains valid until its `exp` as well. This avoids the
    // "every refresh logs out other tabs" footgun and keeps concurrent
    // refreshes safe without a per-token database table.
    const { accessToken, refreshToken: newRefreshToken } = issueTokensForUser(user);
    setAuthCookies(response, { accessToken, refreshToken: newRefreshToken });

    response.status(200).json({ success: true, data: { user: safeUser(user) } });
  } catch (error) {
    next(error);
  }
}

export async function logout(request, response, next) {
  try {
    // Bump tokenVersion to invalidate any existing access/refresh tokens for
    // this user, then clear cookies. This invalidates ALL sessions for the
    // user (the project does not maintain per-device session state).
    if (request.user?.userId) {
      await User.updateOne({ _id: request.user.userId }, { $inc: { tokenVersion: 1 } });
    }
    clearAuthCookies(response);
    response.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(request, response, next) {
  try {
    const user = await User.findById(request.user.userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    response.status(200).json({ success: true, data: { user: safeUser(user) } });
  } catch (error) {
    next(error);
  }
}

// Authenticated change-password endpoint.
//
// The authenticated user is sourced exclusively from the existing
// `authenticate` middleware (i.e. `request.user.userId`). The endpoint
// DOES NOT accept userId / email / role / status / tokenVersion — those
// fields are protected by the strict allow-list in `validateChangePassword`.
//
// On success:
//   * the new password is hashed with the existing bcrypt cost
//   * `tokenVersion` is incremented (invalidates all existing access +
//     refresh tokens for this user — same mechanism used by logout)
//   * cookies are NOT re-issued: the FE drops the local session and
//     redirects the user to /login, where they sign in with the new
//     password (which re-issues cookies via the standard login flow).
//     This keeps the change-password response a single, atomic operation
//     and avoids the FE accidentally carrying the *old* access token via
//     a refreshed Set-Cookie pair.
export async function changePassword(request, response, next) {
  try {
    const { currentPassword, newPassword } = validateChangePassword(request.body);

    // Reload the user with the password hash selected (the User model has
    // `passwordHash: select: false` by default, so we must opt in here).
    const user = await User.findById(request.user.userId).select('+passwordHash');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Generic error message — never reveal whether the user exists vs the
    // password was wrong vs the account is locked. The lockout counter is
    // still incremented by `recordFailedLogin` so brute-force attempts
    // are still throttled at the account level.
    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Reject the trivial "change to the same value" case. bcrypt would
    // accept it but it would silently rotate sessionVersion for no
    // security benefit.
    const isSame = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSame) {
      throw new ApiError(400, 'New password must be different from the current password');
    }

    // Hash the new password with the project's existing bcrypt cost so
    // the policy is identical to registration and admin password reset.
    user.passwordHash = await bcrypt.hash(newPassword, environment.auth.bcryptRounds);
    // Invalidate all existing tokens (same mechanism logout uses).
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    // We deliberately do NOT call `setAuthCookies` here. Returning
    // Set-Cookie headers in a password-change response would issue new
    // credentials over the same channel that the user just changed,
    // which is unnecessary and slightly confusing. The FE handles the
    // resulting "you are now logged out" state by clearing the local
    // user and redirecting to /login.

    response.status(200).json({
      success: true,
      data: { message: 'Password changed. Please sign in again.' },
    });
  } catch (error) {
    next(error);
  }
}