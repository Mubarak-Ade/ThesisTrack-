import type { RequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

import { AppError } from '../errors/index.js';

/**
 * Rate limiting for `POST /auth/forgot-password` (mailer design §9, G4).
 *
 * This is the ONLY unauthenticated route that makes the server send mail, so
 * without a limiter it is an email-bombing vector: an attacker can trigger
 * unlimited reset mails to a victim. Two independent windows guard it:
 *
 *   - per-IP:    5 / 15 min  — stops one client hammering the endpoint;
 *   - per-email: 3 / 15 min  — stops fanning out across many victims cheaply
 *                              (a different IP per target still hits this).
 *
 * Both answer 429 in the standard error envelope by funneling a `RateLimitError`
 * through the central error handler. The limiter triggers on REQUEST COUNT, not
 * on account existence, so it adds no account-enumeration surface.
 *
 * The limiters run BEFORE `validate(...)` so a flood of malformed bodies is
 * still throttled. In-memory stores are adequate for the single-instance
 * `server.ts` deployment; a multi-instance production would move to a shared
 * store (out of scope for MVP — design §9).
 */

/** 429 — too many requests; serialized by the central error handler. */
class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';

  constructor(message = 'Too many requests. Please try again later.') {
    super(message);
  }
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const PER_IP_LIMIT = 5;
const PER_EMAIL_LIMIT = 3;

/** Normalize the target email the same way the schema does (trim + lowercase). */
function emailKey(req: { body?: unknown; ip?: string }): string {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  // A missing/invalid email falls back to the IP so distinct no-email callers
  // aren't lumped into one global bucket (and to satisfy express-rate-limit's
  // IPv6-subnet validation, which wants ipKeyGenerator rather than raw req.ip).
  return email || ipKeyGenerator(req.ip ?? '');
}

export const forgotPasswordIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: PER_IP_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  handler: (_req, _res, next) => next(new RateLimitError()),
});

export const forgotPasswordEmailLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: PER_EMAIL_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => emailKey(req),
  handler: (_req, _res, next) => next(new RateLimitError()),
});

/**
 * Composed guard: run the per-IP window, then the per-email window. Exported as
 * an array so `router.post(path, forgotPasswordLimiter, …)` applies both in
 * order; the two limiters are also exported individually so tests can
 * `resetKey` between cases.
 */
export const forgotPasswordLimiter: RequestHandler[] = [
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
];
