import { describe, expect, it } from 'vitest';

import {
  renderInvitation,
  renderPasswordReset,
} from '../../../src/lib/email-templates.js';

/**
 * Mailer design §4/§12 — the two pure renderers.
 *
 * They must return `{ subject, text, html }`, embed the deep link verbatim in
 * both bodies, render the expiry, and HTML-escape user-controlled values so a
 * name like `<script>` cannot inject markup into the invitation/reset email.
 */

const LINK = 'http://localhost:5173/invite?token=abc%2Fdef';
const EXPIRES = new Date('2026-10-17T12:00:00.000Z');

describe('renderInvitation', () => {
  it('returns subject, text and html', () => {
    const r = renderInvitation({ name: 'Ada Lovelace', link: LINK, expiresAt: EXPIRES });
    expect(typeof r.subject).toBe('string');
    expect(typeof r.text).toBe('string');
    expect(typeof r.html).toBe('string');
    expect(r.subject).toContain('ThesisTrack');
  });

  it('embeds the link verbatim in both bodies', () => {
    const r = renderInvitation({ name: 'Ada', link: LINK, expiresAt: EXPIRES });
    expect(r.text).toContain(LINK);
    expect(r.html).toContain(LINK);
  });

  it('renders the expiry in both bodies', () => {
    const r = renderInvitation({ name: 'Ada', link: LINK, expiresAt: EXPIRES });
    expect(r.text).toContain(EXPIRES.toISOString());
    expect(r.html).toContain(EXPIRES.toISOString());
  });

  it('HTML-escapes a script-tag name in the html body only', () => {
    const r = renderInvitation({
      name: '<script>alert(1)</script>',
      link: LINK,
      expiresAt: EXPIRES,
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    // The plain-text body is not HTML and must keep the literal name.
    expect(r.text).toContain('<script>alert(1)</script>');
  });
});

describe('renderPasswordReset', () => {
  it('returns subject, text and html and embeds the link', () => {
    const link = 'http://localhost:5173/reset-password?token=xyz';
    const r = renderPasswordReset({ name: 'Grace Hopper', link, expiresAt: EXPIRES });
    expect(r.text).toContain(link);
    expect(r.html).toContain(link);
    expect(r.subject).toContain('ThesisTrack');
  });

  it('HTML-escapes a script-tag name in the html body only', () => {
    const r = renderPasswordReset({
      name: '<b>bold</b>',
      link: LINK,
      expiresAt: EXPIRES,
    });
    expect(r.html).not.toContain('<b>bold</b>');
    expect(r.html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});
