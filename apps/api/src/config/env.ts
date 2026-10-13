import 'dotenv/config';
import { cleanEnv, str, port, url, num, bool } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 3001 }), // spec §18.4; vite proxy and all four bash suites assume it
  DATABASE_URL: url(),
  WEB_ORIGIN: str({ default: 'http://localhost:5173' }),

  // Tokens — access tokens are short-lived and live in client memory;
  // refresh tokens are long-lived, stored hashed in `sessions`, and sent
  // as an HTTP-only cookie scoped to the auth endpoints.
  JWT_ACCESS_SECRET: str(),
  // ADR-08: JWT_REFRESH_SECRET deliberately absent — refresh tokens are
  // opaque single-use strings stored hashed in `sessions`, not JWTs
  // (plan 15.6 removed the dead declaration).
  ACCESS_TOKEN_TTL: num({ default: 900 }), // 15 minutes
  REFRESH_TOKEN_TTL: num({ default: 604800 }), // 7 days
  ACTIVATION_TOKEN_TTL: num({ default: 259200 }), // 72 hours
  RESET_TOKEN_TTL: num({ default: 3600 }), // 1 hour

  // Refresh cookie: HTTP-only, SameSite=Lax, path-scoped to /api/v1/auth.
  // Set to true when serving over HTTPS.
  COOKIE_SECURE: bool({ default: false }),
  // Behind the §18.2 reverse proxy: trust X-Forwarded-* so logs, CORS and
  // rate limits see the real client IP. MUST be true in production (§18.4).
  TRUST_PROXY: bool({ default: false }),

  // Document storage (spec §14, §18.6) — local disk under apps/api, never
  // served statically: every byte leaves through an authorization-checked
  // download route (ADR-09, §14.5).
  UPLOAD_DIR: str({ default: './uploads' }),
  UPLOAD_MAX_BYTES: num({ default: 20971520 }), // 20 MB (§14.4)
});
