import { describe, expect, it } from 'vitest';

import { env } from '../../../src/config/env.js';
import { buildInviteLink, buildResetLink } from '../../../src/lib/links.js';

/**
 * Mailer design §4 — deep links built from `env.WEB_ORIGIN`.
 *
 * The SPA reads `?token=` on both `/invite` and `/reset-password`, so the
 * builders must (a) target those exact paths, (b) url-encode the token, and
 * (c) base themselves on WEB_ORIGIN.
 */

describe('buildInviteLink', () => {
  it('targets /invite with an encoded ?token=', () => {
    expect(buildInviteLink('tok')).toBe(`${env.WEB_ORIGIN}/invite?token=tok`);
  });

  it('url-encodes tokens containing reserved characters', () => {
    // base64url never emits these, but the contract must hold regardless.
    expect(buildInviteLink('a/b+c')).toBe(`${env.WEB_ORIGIN}/invite?token=a%2Fb%2Bc`);
  });
});

describe('buildResetLink', () => {
  it('targets /reset-password with an encoded ?token=', () => {
    expect(buildResetLink('tok')).toBe(`${env.WEB_ORIGIN}/reset-password?token=tok`);
  });

  it('url-encodes tokens containing reserved characters', () => {
    expect(buildResetLink('x y&z')).toBe(`${env.WEB_ORIGIN}/reset-password?token=x%20y%26z`);
  });
});
