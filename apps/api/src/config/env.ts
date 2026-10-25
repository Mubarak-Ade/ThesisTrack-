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

  // Refresh cookie: HTTP-only, path-scoped to /api/v1/auth. SameSite comes from
  // COOKIE_SAME_SITE below so split-origin deployments can opt into `none`.
  // Set COOKIE_SECURE to true when serving over HTTPS (required for `none`).
  COOKIE_SECURE: bool({ default: false }),
  // SameSite policy for the refresh cookie (spec §18.4 delta, 2026-10-25):
  //   lax    — default; same-site XHR (dev proxy, Docker nginx, custom
  //            subdomains like app.example.com → api.example.com).
  //   none   — REQUIRED when web and API are on different registrable domains
  //            (e.g. Vercel + Render) so the browser sends the cookie
  //            cross-site; requires COOKIE_SECURE=true.
  //   strict — opt-in hardening; would also drop top-level entry navigation.
  COOKIE_SAME_SITE: str({ choices: ['lax', 'strict', 'none'], default: 'lax' }),
  // Behind the §18.2 reverse proxy: trust X-Forwarded-* so logs, CORS and
  // rate limits see the real client IP. MUST be true in production (§18.4).
  TRUST_PROXY: bool({ default: false }),

  // Document storage (spec §14, §18.6) — local disk under apps/api, never
  // served statically: every byte leaves through an authorization-checked
  // download route (ADR-09, §14.5).
  UPLOAD_DIR: str({ default: './uploads' }),
  UPLOAD_MAX_BYTES: num({ default: 20971520 }), // 20 MB (§14.4)

  // ── Mailer (spec: mailer design §5, D2) ─────────────────────────────
  // Behind the swappable `sendMail` interface (ADR-09 pattern) there are now
  // TWO transports, chosen at send time by which credentials are present:
  //
  //   BREVO_API_KEY  Brevo transactional REST API (api.brevo.com). Takes
  //                  precedence when set. No SMTP/DNS/SPF needed to start —
  //                  the sender is just MAIL_FROM, which must be a verified
  //                  SENDER in the Brevo console (a personal mailbox works; a
  //                  custom domain is NOT required to begin). Ideal for the
  //                  Render deploy with no domain yet.
  //   SMTP_*         nodemailer over SMTP (the original seam). Used when
  //                  BREVO_API_KEY is empty and SMTP_HOST is set.
  //
  // EVERY value defaults so an unset BREVO_API_KEY + SMTP_HOST still boots
  // cleanly and `sendMail` takes its no-network `skipped:'unconfigured'` path —
  // that is what keeps the ~400-test suite and the bash suites green with no
  // mail configured (spec §4, §12).
  //
  //   BREVO_API_KEY  '' = not using Brevo. e.g. xkeysib-…
  //   SMTP_HOST      '' = unconfigured -> no-op. e.g. smtp.postmarkapi.co, SES.
  //                  NOT consumer Gmail for production (datacenter IPs blocked;
  //                  spec §11) — point at a reputation-managed relay.
  //   SMTP_PORT      587 (STARTTLS) by default; 465 when SMTP_SECURE=true.
  //   SMTP_USER      optional — local relays (MailHog/Mailtrap) need no auth.
  //   SMTP_PASS      required only when SMTP_USER is set (checked in mailer.ts).
  //   SMTP_SECURE    true = implicit TLS/465; false = STARTTLS/587.
  //   MAIL_FROM      required to send, e.g. "ThesisTrack <no-reply@domain.edu>".
  //
  // Cross-field rules (host/user/pass/from) are enforced in lib/mailer.ts at
  // send time, NOT by envalid, so a missing host/key never blocks boot.
  BREVO_API_KEY: str({ default: '' }),
  SMTP_HOST: str({ default: '' }),
  SMTP_PORT: num({ default: 587 }),
  SMTP_USER: str({ default: '' }),
  SMTP_PASS: str({ default: '' }),
  SMTP_SECURE: bool({ default: false }),
  MAIL_FROM: str({ default: '' }),
});

// Cross-field guard (spec §18.4 delta, 2026-10-25): browsers silently discard a
// `SameSite=None` cookie that is not `Secure`, so a split-origin deployment
// would boot "fine" and then fail every refresh with no visible cause. Fail at
// boot with an actionable message instead.
if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) {
  throw new Error(
    'COOKIE_SAME_SITE=none requires COOKIE_SECURE=true — browsers drop insecure ' +
      'SameSite=None cookies, which breaks the refresh flow (set COOKIE_SECURE=true ' +
      'behind HTTPS, or use same-site subdomains with COOKIE_SAME_SITE=lax)',
  );
}
