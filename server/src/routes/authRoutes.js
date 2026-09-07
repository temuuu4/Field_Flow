import { Router } from 'express';
import {
  changePassword,
  getCurrentUser,
  login,
  logout,
  refresh,
  register,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authRateLimiters } from '../middleware/rateLimit.js';

const router = Router();

// Public authentication endpoints. Each carries its own per-IP rate limiter
// to complement the per-account lockout and prevent credential stuffing /
// enumeration / refresh-token brute-forcing from a single source.
router.post('/register', authRateLimiters.register, register);
router.post('/login', authRateLimiters.login, login);
router.post('/refresh', authRateLimiters.refresh, refresh);

// Authenticated endpoints.
//
// `PATCH /api/auth/password` is the authenticated change-password route.
// It is mounted behind the existing `authenticate` middleware (so the
// authenticated user is the only acceptable identity) and behind the
// per-IP rate limiter (so a single source cannot spam the endpoint).
// The CSRF middleware in `app.js` enforces the double-submit token for
// PATCH requests — the frontend's `api/client.js` already attaches
// `X-CSRF-Token` to all state-changing requests automatically.
router.patch('/password', authRateLimiters.password, authenticate, changePassword);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

export default router;