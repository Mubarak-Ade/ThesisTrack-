import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import nodemailer from 'nodemailer';

import { env } from '../../../src/config/env.js';
import { sendMail } from '../../../src/lib/mailer.js';

/**
 * Mailer design §7 — the CONFIGURED path, driven by mocking env + nodemailer.
 *
 * Proves the relay-failure guarantee: a rejecting/slow transport is swallowed —
 * `sendMail` always RESOLVES (never rejects), so a `void dispatch…(...)` on the
 * response path can never turn a mail outage into an HTTP 500. Also covers the
 * delivered and misconfigured (MAIL_FROM missing) branches.
 */

const RENDERED = { subject: 's', text: 't', html: '<p>t</p>' };

// Force the configured path (real test env has SMTP_HOST empty).
vi.mock('../../../src/config/env.js', () => ({
  env: {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_SECURE: false,
    MAIL_FROM: 'ThesisTrack <no-reply@example.test>',
    WEB_ORIGIN: 'http://localhost:5173',
  },
}));

const sendMailMock = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

beforeEach(() => {
  sendMailMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendMail — transport rejects (relay down)', () => {
  it('RESOLVES with an error outcome instead of rejecting', async () => {
    sendMailMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(sendMail('a@b.c', 'invitation', RENDERED)).resolves.toMatchObject({
      delivered: false,
      error: expect.stringContaining('ECONNREFUSED'),
    });
  });

  it('does not throw when awaited by a fire-and-forget caller', async () => {
    sendMailMock.mockRejectedValue(new Error('boom'));
    await expect(sendMail('a@b.c', 'password_reset', RENDERED)).resolves.toBeDefined();
  });
});

describe('sendMail — transport succeeds', () => {
  it('resolves delivered:true and forwards from/to/subject/text/html', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'x' });
    const out = await sendMail('a@b.c', 'invitation', RENDERED);
    expect(out).toEqual({ delivered: true });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: env.MAIL_FROM,
      to: 'a@b.c',
      subject: RENDERED.subject,
      text: RENDERED.text,
      html: RENDERED.html,
    });
  });
});

describe('sendMail — misconfigured (MAIL_FROM missing)', () => {
  it('skips without touching the transport', async () => {
    const original = env.MAIL_FROM;
    (env as { MAIL_FROM: string }).MAIL_FROM = '';
    try {
      await expect(sendMail('a@b.c', 'invitation', RENDERED)).resolves.toEqual({
        delivered: false,
        skipped: 'misconfigured',
      });
      expect(sendMailMock).not.toHaveBeenCalled();
    } finally {
      (env as { MAIL_FROM: string }).MAIL_FROM = original;
    }
  });
});
