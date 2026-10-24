import { describe, expect, it, vi, afterEach } from 'vitest';
import nodemailer from 'nodemailer';

import { env } from '../../../src/config/env.js';
import { sendMail, dispatchInvitationEmail } from '../../../src/lib/mailer.js';

/**
 * Mailer design §4/§12 — the unconfigured no-network path.
 *
 * In every test/dev run `SMTP_HOST` is empty, so `sendMail` must:
 *   - resolve (never reject — callers `void` it, spec §7),
 *   - return `{ delivered:false, skipped:'unconfigured' }`,
 *   - and NEVER construct a transport or open a socket.
 * This is the invariant that keeps the ~400-test suite green with no SMTP.
 *
 * The socket claim is proven by spying on `nodemailer.createTransport`: if the
 * unconfigured branch ran correctly it is never called.
 */

const RENDERED = { subject: 's', text: 't', html: '<p>t</p>' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendMail — unconfigured (SMTP_HOST empty)', () => {
  it('is the state the suite runs in', () => {
    // Guards the assumption the whole file rests on: NEITHER transport is
    // configured, so sendMail must take the no-network path.
    expect(env.SMTP_HOST).toBe('');
    expect(env.BREVO_API_KEY).toBe('');
  });

  it('resolves with skipped:"unconfigured" and never rejects', async () => {
    await expect(sendMail('a@b.c', 'invitation', RENDERED)).resolves.toEqual({
      delivered: false,
      skipped: 'unconfigured',
    });
  });

  it('never constructs a nodemailer transport (no socket opened)', async () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    await sendMail('a@b.c', 'password_reset', RENDERED);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('dispatchInvitationEmail — fire-and-forget safety', () => {
  it('returns synchronously (void) and never throws with SMTP unconfigured', () => {
    expect(() =>
      dispatchInvitationEmail(
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
        'tok',
        new Date(),
      ),
    ).not.toThrow();
  });
});
