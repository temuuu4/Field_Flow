import { ApiError } from '../errors/ApiError.js';
import { User } from '../models/User.js';
import { USER_STATUSES } from '../models/constants.js';
import { environment } from '../config/env.js';
import { tokenTypes, verifyToken } from '../services/jwtService.js';

const extractToken = (request) => {
  // Prefer the access token cookie. Fall back to Authorization: Bearer.
  const cookieToken = request.cookies?.[environment.auth.cookieName];
  if (cookieToken) return cookieToken;
  const header = request.headers.authorization;
  if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return undefined;
};

const reject = (message = 'Authentication required') => {
  throw new ApiError(401, message);
};

// Reject if the token's `tv` does not match the user's current tokenVersion.
// Looks up the user but only selects the fields we need.
const isTokenStillValidForUser = async (decoded) => {
  const user = await User.findById(decoded.sub)
    .select('status role tokenVersion')
    .lean();
  if (!user) return false;
  if (user.status !== USER_STATUSES.ACTIVE) return false;
  if (user.tokenVersion !== decoded.tv) return false;
  // Stash role on the decoded payload so downstream middleware (requireRole)
  // does not need to re-query the database.
  decoded.role = user.role;
  return true;
};

export function authenticate(request, response, next) {
  try {
    const token = extractToken(request);
    if (!token) reject();

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      reject('Invalid or expired token');
    }

    if (decoded.type !== tokenTypes.ACCESS || !decoded.sub) {
      reject('Invalid or expired token');
    }

    // Verify the user still exists, is active, and the token has not been
    // revoked via a tokenVersion bump.
    isTokenStillValidForUser(decoded)
      .then((valid) => {
        if (!valid) reject('Invalid or expired token');
        // Attach a minimal, server-validated identity. Never trust client claims.
        request.user = {
          userId: decoded.sub,
          role: decoded.role,
          tokenVersion: decoded.tv,
        };
        next();
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(request, response, next) {
  const token = extractToken(request);
  if (!token) {
    next();
    return;
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== tokenTypes.ACCESS || !decoded.sub) {
      next();
      return;
    }
    isTokenStillValidForUser(decoded)
      .then((valid) => {
        if (valid) {
          request.user = {
            userId: decoded.sub,
            role: decoded.role,
            tokenVersion: decoded.tv,
          };
        }
        next();
      })
      .catch(() => next());
  } catch {
    next();
  }
}

export function requireRole(allowedRoles) {
  return (request, response, next) => {
    if (!request.user) {
      throw new ApiError(401, 'Authentication required');
    }
    if (!Array.isArray(allowedRoles) || !allowedRoles.includes(request.user.role)) {
      throw new ApiError(403, 'Insufficient permissions');
    }
    next();
  };
}

export function getAuthenticatedUser(request) {
  if (!request.user?.userId) return undefined;
  return User.findById(request.user.userId);
}
