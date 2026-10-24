import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';
import {
  renderInvitation,
  renderPasswordReset,
  type RenderedEmail,
} from './email-templates.js';
import { buildInviteLink, buildResetLink } from './links.js';

/**
 * Swappable mail transport (mailer design §4, D2 — ADR-09 pattern applied to
 * mail). Callers render a `{ subject, text, html }` and hand it here; nothing
 * above this module knows about nodemailer, SMTP, Brevo, or any provider.
 *
 * Two transports sit behind `sendMail`, selected by which credentials exist:
 *   - BREVO_API_KEY set  → Brevo transactional REST API (precedence);
 *   - else SMTP_HOST set → nodemailer over SMTP;
 *   - else               → no-op `skipped:'unconfigured'`, NO socket opened.
 *
 * Contract (both transports):
 *   - `sendMail` NEVER rejects and NEVER throws. Callers dispatch it
 *     fire-and-forget (`void sendMail(...)`, spec §7) — a slow or down relay
 *     must never alter the caller's HTTP response.
 *   - The unconfigured path (neither key set) opens NO socket — this is what
 *     keeps the ~400-test suite and the bash suites green with no mail
 *     configured (spec §4, §12).
 *   - Failures are logged with recipient + template + error, NEVER the token
 *     (spec §7, §10).
 *
 * Production delivery is a deploy-time `.env` concern, not a code one (spec
 * §11): use Brevo (no domain needed to start) or point SMTP at a
 * reputation-managed relay (SES/Mailgun/Postmark/SendGrid), not consumer Gmail.
 */

/** The two transactional templates this app can send. */
export type MailTemplate = 'invitation' | 'password_reset';

export type SendOutcome =
  | { delivered: true }
  | { delivered: false; skipped: 'unconfigured' | 'misconfigured' }
  | { delivered: false; error: string };

// ── Transport 1: Brevo transactional REST API ───────────────────────────────
// Selected when BREVO_API_KEY is set (takes precedence over SMTP). No SMTP
// handshake, no DNS/SPF setup required to begin: the message goes straight to
// api.brevo.com. The sender is MAIL_FROM, which must be a verified SENDER in
// the Brevo console — a personal mailbox (e.g. your Gmail) is enough; you do
// NOT need to own a domain to start. Needs Node 18+ (global fetch).
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** MAIL_FROM is "Name <email>" or a bare email; Brevo wants them split. */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() };
}

// ── Transient-failure policy (hotspot DNS stalls, 429s, relay hiccups) ─────
//
// The observed production-ish failure on this machine is a fetch that dies
// with a bare "fetch failed" while the real fault (a DNS resolution stall or
// a connect timeout) sits under `err.cause`. `describeError` walks the cause
// chain so the log reads `fetch failed [UND_ERR_CONNECT_TIMEOUT] ← …` —
// outcome `error` strings stay the plain top-level message (contract §4), the
// enrichment lives only in the log line. Failures classified transient get
// two more tries with short backoff; bad keys/addresses (other 4xx, SMTP
// 5xx) fail fast. Delays are zero under vitest (NODE_ENV=test) so failing-
// send tests never sleep.

const RETRY_DELAYS_MS = process.env.NODE_ENV === 'test' ? [0, 0] : [400, 1_200];
const RETRY_TOTAL = RETRY_DELAYS_MS.length + 1;

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const tag = (e: Error): string => {
    const code = 'code' in e ? (e as { code?: unknown }).code : undefined;
    return typeof code === 'string' ? `${e.message} [${code}]` : e.message;
  };
  const parts = [tag(err)];
  let cause: unknown = err.cause;
  for (let i = 0; cause instanceof Error && i < 2; i++) {
    parts.push(tag(cause));
    cause = cause.cause;
  }
  return parts.join(' ← ');
}

/**
 * Runs `attempt` until it reports a non-transient outcome or the retries are
 * spent. The attempt fn classifies its own failure (only it knows a 401 from
 * a dropped connection) and returns the outcome to resolve with. Never
 * throws — transports catch internally, preserving sendMail's never-rejects
 * contract (§7): callers dispatch fire-and-forget and must never see this
 * reject or hold an HTTP response for the backoff.
 */
async function withRetries(
  attempt: (n: number) => Promise<{ value: SendOutcome; transient: boolean }>,
): Promise<SendOutcome> {
  for (let n = 1; ; n++) {
    const { value, transient } = await attempt(n);
    if (!transient || n >= RETRY_TOTAL) return value;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[n - 1]));
  }
}

async function sendViaBrevo(
  to: string,
  template: MailTemplate,
  rendered: RenderedEmail,
): Promise<SendOutcome> {
  if (!env.MAIL_FROM) {
    console.error(`[mailer] cannot send "${template}" to ${to}: MAIL_FROM is not set`);
    return { delivered: false, skipped: 'misconfigured' };
  }

  return withRetries(async (n) => {
    try {
      const res = await fetch(BREVO_URL, {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: parseFrom(env.MAIL_FROM),
          to: [{ email: to }],
          subject: rendered.subject,
          htmlContent: rendered.html,
          textContent: rendered.text,
        }),
        signal: AbortSignal.timeout(10_000), // a slow API must not hang forever
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        // 429 and 5xx are the relay asking us to come back later; every
        // other 4xx (bad key, bad payload, unverified sender) will fail
        // identically on the next try, so it is terminal.
        const transient = res.status === 429 || res.status >= 500;
        const suffix = transient ? ` (attempt ${n}/${RETRY_TOTAL} — retrying)` : '';
        console.error(
          `[mailer] send failed for "${template}" to ${to}: HTTP ${res.status} ${detail}${suffix}`,
        );
        return { value: { delivered: false, error: `HTTP ${res.status}` }, transient };
      }
      return { value: { delivered: true }, transient: false };
    } catch (err) {
      // Network-class failure (DNS stall, connect timeout, socket reset) —
      // transient by nature; describeError surfaces the cause chain.
      const message = err instanceof Error ? err.message : String(err);
      const suffix = n < RETRY_TOTAL ? ` (attempt ${n}/${RETRY_TOTAL} — retrying)` : '';
      console.error(`[mailer] send failed for "${template}" to ${to}: ${describeError(err)}${suffix}`);
      return { value: { delivered: false, error: message }, transient: true };
    }
  });
}

// ── Transport 2: nodemailer over SMTP (original seam) ───────────────────────
// Used when BREVO_API_KEY is empty and SMTP_HOST is set.

// Transport is created lazily and cached — config is static for the process
// lifetime, and reusing one transport pools connections across sends.
let transport: Transporter | undefined;

// The unconfigured notice is logged at most once per process, not once per
// send: a busy import would otherwise spam the log with identical lines.
let loggedUnconfigured = false;

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true → 465/SMTPS; false → 587/STARTTLS
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined, // local relays (MailHog/Mailtrap) need no auth
  });
  return transport;
}

/** Cross-field SMTP config rules — enforced at send time so an unset host boots. */
function smtpMisconfiguration(): string | undefined {
  if (!env.MAIL_FROM) return 'MAIL_FROM is not set';
  if (env.SMTP_USER && !env.SMTP_PASS) return 'SMTP_PASS is not set but SMTP_USER is';
  return undefined;
}

async function sendViaSmtp(
  to: string,
  template: MailTemplate,
  rendered: RenderedEmail,
): Promise<SendOutcome> {
  if (!env.SMTP_HOST) {
    if (!loggedUnconfigured) {
      loggedUnconfigured = true;
      console.log(
        '[mailer] no mail transport configured (BREVO_API_KEY and SMTP_HOST are both empty) — outgoing email is disabled; tokens are logged/returned in dev only.',
      );
    }
    return { delivered: false, skipped: 'unconfigured' };
  }

  const misconfigured = smtpMisconfiguration();
  if (misconfigured) {
    // A configured-but-broken relay is a real deployment fault: log loudly on
    // every send so it cannot pass silently.
    console.error(`[mailer] cannot send "${template}" to ${to}: ${misconfigured}`);
    return { delivered: false, skipped: 'misconfigured' };
  }

  return withRetries(async (n) => {
    try {
      await getTransport().sendMail({
        from: env.MAIL_FROM,
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      return { value: { delivered: true }, transient: false };
    } catch (err) {
      // Log recipient + template + error (cause chain included). The rendered
      // bodies (which contain the one-time token) are deliberately NOT logged.
      const message = err instanceof Error ? err.message : String(err);
      // SMTP classification: no responseCode → connection-level (DNS/refused/
      // reset) → transient; 4xx → "try later" (RFC 5321) → transient; 5xx →
      // permanent (bad address/relay policy) → terminal.
      const rc = (err as { responseCode?: unknown } | null)?.responseCode;
      const transient = typeof rc !== 'number' || (rc >= 400 && rc < 500);
      const suffix = transient && n < RETRY_TOTAL ? ` (attempt ${n}/${RETRY_TOTAL} — retrying)` : '';
      console.error(`[mailer] send failed for "${template}" to ${to}: ${describeError(err)}${suffix}`);
      return { value: { delivered: false, error: message }, transient };
    }
  });
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Sends one message through whichever transport is configured (Brevo REST API
 * first, then SMTP), or resolves `skipped:'unconfigured'` with NO socket if
 * neither is set. NEVER rejects/throws (callers `void` it, spec §7).
 */
export async function sendMail(
  to: string,
  template: MailTemplate,
  rendered: RenderedEmail,
): Promise<SendOutcome> {
  // Brevo takes precedence when configured — it needs no domain/DNS and is the
  // path that works on a Render deploy without a custom domain.
  if (env.BREVO_API_KEY) {
    return sendViaBrevo(to, template, rendered);
  }
  return sendViaSmtp(to, template, rendered);
}

/**
 * Fire-and-forget dispatchers (mailer design §4, §7). They compose the deep
 * link + template + send and are meant to be called as `void dispatch…(...)`:
 * after the DB commit, never awaited on the response path, never throwing.
 *
 * Two guards make "never alters the response" airtight:
 *   - `sendMail` resolves (never rejects), so `void` can't create an
 *     unhandled rejection; and
 *   - the synchronous render+link work is itself wrapped in try/catch, so a
 *     hypothetical render error is logged, not thrown up the response path.
 */

export function dispatchInvitationEmail(
  user: { firstName: string; lastName: string; email: string },
  token: string,
  expiresAt: Date,
): void {
  try {
    void sendMail(
      user.email,
      'invitation',
      renderInvitation({
        name: `${user.firstName} ${user.lastName}`,
        link: buildInviteLink(token),
        expiresAt,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mailer] failed to render/send invitation to ${user.email}: ${message}`);
  }
}

export function dispatchPasswordResetEmail(
  user: { firstName: string; lastName: string; email: string },
  token: string,
  expiresAt: Date,
): void {
  try {
    void sendMail(
      user.email,
      'password_reset',
      renderPasswordReset({
        name: `${user.firstName} ${user.lastName}`,
        link: buildResetLink(token),
        expiresAt,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mailer] failed to render/send password reset to ${user.email}: ${message}`);
  }
}
