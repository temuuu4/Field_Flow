import express from 'express';
import cookieParser from 'cookie-parser';
import { environment } from './config/env.js';
import { ApiError } from './errors/ApiError.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { ensureCsrfCookie, csrfProtection, securityHeaders } from './middleware/security.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import collectionLocationRoutes from './routes/collectionLocationRoutes.js';
import journeyRoutes from './routes/journeyRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import presenceRoutes from './routes/presenceRoutes.js';
import pushSubscriptionRoutes from './routes/pushSubscriptionRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import recurringScheduleRoutes from './routes/recurringScheduleRoutes.js';
import sampleRoutes from './routes/sampleRoutes.js';
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { isPushConfigured } from './services/pushService.js';

const app = express();

app.disable('x-powered-by');
app.disable('etag');

// `trust proxy` controls how Express derives `request.ip` and which
// `X-Forwarded-*` headers it honors. Without it, every request behind a
// reverse proxy looks like it came from 127.0.0.1, silently breaking
// per-IP rate limiting and audit-log IP attribution. Production must
// set `TRUST_PROXY` to a numeric hop count or a known subnet.
const trustProxySetting = (process.env.TRUST_PROXY ?? '').trim();
if (trustProxySetting !== '') {
  // Numeric hop counts and the named presets are accepted; anything else
  // is ignored so an attacker cannot spoof their IP via an untrusted header.
  if (/^\d+$/.test(trustProxySetting)) {
    app.set('trust proxy', Number(trustProxySetting));
  } else if (['loopback', 'linklocal', 'uniquelocal'].includes(trustProxySetting)) {
    app.set('trust proxy', trustProxySetting);
  } else if (trustProxySetting === 'true') {
    app.set('trust proxy', true);
  } else if (trustProxySetting === 'false') {
    app.set('trust proxy', false);
  }
}

app.use(securityHeaders);

const allowedOrigins = environment.corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// In production we explicitly refuse a wildcard CORS_ORIGIN. Browsers
// already refuse to send credentials with `*`, but a misconfigured `*`
// would still allow non-credentialed cross-origin reads and obscure the
// deployer's intent. Fail fast at startup instead of shipping a permissive
// policy silently.
const hasWildcardOrigin = allowedOrigins.includes('*');
if (hasWildcardOrigin && environment.nodeEnv === 'production') {
  throw new Error(
    'Refusing to start: CORS_ORIGIN="*" is not allowed in production. ' +
    'Set CORS_ORIGIN to an explicit comma-separated list of trusted origins.',
  );
}

// Treat `*` as "any origin allowed but no credentials" — browsers already
// refuse to send cookies in that combination.
const credentialsAllowed = !hasWildcardOrigin;

if (!isPushConfigured()) {
  console.warn('[push] Web Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the server environment to enable push notifications.');
}

app.use((request, response, next) => {
  const origin = request.headers.origin;
  const originAllowed = !origin || hasWildcardOrigin || allowedOrigins.includes(origin);
  if (origin && !originAllowed) {
    next(new ApiError(403, 'Origin is not allowed'));
    return;
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', hasWildcardOrigin ? '*' : origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  if (credentialsAllowed) {
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});
// Conservative size caps: the JSON limit is generous enough for GPS/waypoint
// batches without enabling trivial denial-of-service vectors; URL-encoded
// bodies are not expected from the SPA but we still cap them explicitly.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// Issue a CSRF cookie on every request so authenticated state-changing
// requests from the SPA can echo it back via the X-CSRF-Token header.
app.use(ensureCsrfCookie);

// Pre-authentication `POST /api/auth/register`, `POST /api/auth/login` and
// `POST /api/auth/refresh` cannot have a CSRF cookie/header pair yet
// (they establish the session) so they are explicitly excluded. Safe
// methods (GET/HEAD/OPTIONS) are skipped by the middleware itself.
app.use(
  csrfProtection({
    skip: [/^\/api\/auth\/(register|login|refresh)/],
  }),
);

app.get('/health', (request, response) => {
  response.json({ success: true, data: { status: 'ok', service: 'fieldflow-server', environment: environment.nodeEnv } });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/collection-locations', collectionLocationRoutes);
app.use('/api/journeys', journeyRoutes);
app.use('/api/driver-presence', presenceRoutes);
app.use('/api/samples', sampleRoutes);
app.use('/api/recurring-schedules', recurringScheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push-subscriptions', pushSubscriptionRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;