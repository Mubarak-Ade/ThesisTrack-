import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import nodemailer from 'nodemailer';

// Mock env so BREVO_API_KEY is set (with SMTP_HOST ALSO set, to prove Brevo
// precedence). Mutable per-test via the imported `env` object.
vi.mock('../../../src/config/env.js', () => ({
  env: {
    BREVO_API_KEY: 'xkeysib-test-key',
    SMTP_HOST: 'smtp.example.test', // non-empty → proves Brevo wins over SMTP
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_SECURE: false,
    MAIL_FROM: 'ThesisTrack <no-reply@example.test>',
    WEB_ORIGIN: 'http://localhost:5173',
  },
}));

import { env } from '../../../src/config/env.js';
import { sendMail } from '../../../src/lib/mailer.js';

/**
 * Mailer — Brevo REST transport (api.brevo.com), selected when BREVO_API_KEY
 * is set and taking precedence over SMTP. Proves:
 *   - configured → POSTs the correct JSON (sender split, to/subject/html/text)
 *     and does NOT touch the nodemailer/SMTP transport;
 *   - non-2xx response or network failure → resolves `delivered:false`
 *     (never rejects — callers `void` it, spec §7);
 *   - missing MAIL_FROM → `skipped:'misconfigured'`, no fetch;
 *   - BREVO_API_KEY empty → NO fetch (no socket), falls to the SMTP path.
 * `fetch` is stubbed — no real network is touched.
 */

const RENDERED = { subject: 'Sub', text: 'Plain body', html: '<p>Plain body</p>' };
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  // Reset the mutable env for every case.
  env.BREVO_API_KEY = 'xkeysib-test-key';
  env.SMTP_HOST = 'smtp.example.test';
  env.MAIL_FROM = 'ThesisTrack <no-reply@example.test>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendMail — Brevo REST transport', () => {
  it('POSTs the correct payload and returns delivered:true (Brevo beats SMTP)', async () => {
    const createSpy = vi.spyOn(nodemailer, 'createTransport');
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const out = await sendMail('user@example.test', 'password_reset', RENDERED);
    expect(out).toEqual({ delivered: true });

    // Brevo took precedence: the SMTP transport was never constructed.
    expect(createSpy).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BREVO_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('xkeysib-test-key');
    expect(init.headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'ThesisTrack', email: 'no-reply@example.test' });
    expect(body.to).toEqual([{ email: 'user@example.test' }]);
    expect(body.subject).toBe(RENDERED.subject);
    expect(body.htmlContent).toBe(RENDERED.html);
    expect(body.textContent).toBe(RENDERED.text);
  });

  it('splits a bare MAIL_FROM into sender.email with no name', async () => {
    env.MAIL_FROM = 'plain@example.test';
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await sendMail('user@example.test', 'invitation', RENDERED);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sender).toEqual({ email: 'plain@example.test' });
    expect(body.sender.name).toBeUndefined();
  });

  it('resolves delivered:false with the HTTP status on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const out = await sendMail('user@example.test', 'invitation', RENDERED);
    expect(out).toEqual({ delivered: false, error: 'HTTP 401' });

    // The log names recipient + template + status, never the rendered body/token.
    const logged = errSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('user@example.test');
    expect(logged).toContain('invitation');
    expect(logged).not.toContain(RENDERED.html);
    expect(logged).not.toContain(RENDERED.text);
  });

  it('resolves delivered:false when fetch rejects (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const out = await sendMail('user@example.test', 'password_reset', RENDERED);
    expect(out).toEqual({ delivered: false, error: 'fetch failed' });
  });

  it('skips as misconfigured (no fetch) when MAIL_FROM is empty', async () => {
    env.MAIL_FROM = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const out = await sendMail('user@example.test', 'invitation', RENDERED);
    expect(out).toEqual({ delivered: false, skipped: 'misconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens no socket (no fetch) when BREVO_API_KEY is empty', async () => {
    env.BREVO_API_KEY = '';
    env.SMTP_HOST = ''; // neither transport → unconfigured no-op
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const out = await sendMail('user@example.test', 'invitation', RENDERED);
    expect(out).toEqual({ delivered: false, skipped: 'unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
