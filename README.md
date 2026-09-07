# FieldFlow deployment

FieldFlow is a React single-page application backed by Express and MongoDB.

## Local verification

Install each locked dependency set and build the frontend:

```powershell
npm ci
npm run build
npm --prefix server ci
npm --prefix server run validate
```

Copy `server/.env.example` to a private deployment environment (or inject the
same variables through the platform). Do not commit `.env`, VAPID private keys,
JWT secrets, or development certificates.

## Production requirements

- Serve `dist/` behind HTTPS with an SPA fallback to `index.html`.
- Route `/api` and `/health` to the backend, or set `VITE_API_BASE_URL` to the
  explicit HTTPS API origin and add the frontend origin to `CORS_ORIGIN`.
- Use HTTPS for local development (`https://localhost:5173`), keep `AUTH_COOKIE_SECURE=true`
  when the browser is served over TLS, and never downgrade geolocation/camera/push
  requirements for convenience. The app remains compatible with a reverse proxy or
  platform-managed TLS termination in production.
- Set `NODE_ENV=production`, `AUTH_COOKIE_SECURE=true`, a 32+ character random
  `JWT_SECRET`, MongoDB Atlas `MONGODB_URI`, an explicit `CORS_ORIGIN`, and
  VAPID public/private keys. Configure `TRUST_PROXY` only for known proxy hops.
- Run at least one backend process continuously. Its built-in recurring
  scheduler runs at startup and every `RECURRING_SCHEDULER_INTERVAL_SECONDS`
  (60 by default); unique schedule/occurrence keys make retries safe.
- Configure MongoDB backups, monitoring, and indexes. The app connects with a
  10-second server-selection timeout and exposes `/health` for probes.

Web Push requires HTTPS (or localhost during development), browser permission,
and an active subscription. It cannot be guaranteed on unsupported browsers,
when permission is denied, or when the device has no network connection.
