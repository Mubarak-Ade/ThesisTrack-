import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { users } from '../../src/schema/index.js';

/**
 * Mailer design §6 (G2) — forgot-password response shape.
 *
 * Outside production the response carries `devToken` AND `email` together so a
 * console-less client can still correlate the two. Both fields are gated on
 * `NODE_ENV !== 'production'` AND token-exists: for an unknown or inactive
 * account neither field is present and the message is byte-identical to a real
 * hit, so the response stays enumeration-safe and constant-200.
 *
 * NODE_ENV is non-production under vitest (development/test), so the dev branch
 * is the one under test here.
 */

const d = (res: request.Response): any => res.body.data;
const SAME_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

async function insertUser(opts: { isActive: boolean; withPassword?: boolean }) {
  const stamp = randomUUID().slice(0, 8);
  const passwordHash = opts.withPassword ? await bcrypt.hash('SomePass123!', 4) : null;
  const [row] = await db
    .insert(users)
    .values({
      email: `reset-${stamp}@integration.test`,
      firstName: 'Reset',
      lastName: stamp,
      role: 'student',
      isActive: opts.isActive,
      passwordHash,
    })
    .returning();
  return row;
}

let active: Awaited<ReturnType<typeof insertUser>>;
let inactive: Awaited<ReturnType<typeof insertUser>>;

beforeAll(async () => {
  active = await insertUser({ isActive: true, withPassword: true });
  inactive = await insertUser({ isActive: false });
});

afterAll(() => db.$client.end());

describe('POST /auth/forgot-password — dev response shape', () => {
  it('returns devToken AND the correlated email for an active account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: active.email });
    expect(res.status).toBe(200);

    const data = d(res);
    expect(typeof data.devToken).toBe('string');
    expect(data.devToken.length).toBeGreaterThan(0);
    // §6/G2: email rides alongside the token so the two can be correlated.
    expect(data.email).toBe(active.email);
    expect(data.message).toBe(SAME_MESSAGE);
  });

  it('omits devToken AND email for an unknown email (enumeration-safe)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `ghost-${randomUUID().slice(0, 8)}@integration.test` });
    expect(res.status).toBe(200);

    const data = d(res);
    expect(data.devToken).toBeUndefined();
    expect(data.email).toBeUndefined();
    // Byte-identical message to a real hit → no observable difference.
    expect(data.message).toBe(SAME_MESSAGE);
  });

  it('omits devToken AND email for an inactive (never-activated) account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: inactive.email });
    expect(res.status).toBe(200);

    const data = d(res);
    expect(data.devToken).toBeUndefined();
    expect(data.email).toBeUndefined();
    expect(data.message).toBe(SAME_MESSAGE);
  });

  it('emits the [password-reset] token line to stdout outside production (2.2)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: active.email });
      expect(res.status).toBe(200);
      const token = d(res).devToken;
      expect(typeof token).toBe('string');

      const line = logSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].startsWith('[password-reset]'),
      );
      expect(line, '[password-reset] log line should be emitted in non-prod').toBeDefined();
      expect(line![0]).toContain(token);

      // The production branch is the same `env.NODE_ENV !== 'production'` guard
      // that hides devToken/email above; under vitest (NODE_ENV=test) it is
      // false, so this asserts the log fires whenever the dev response does.
    } finally {
      logSpy.mockRestore();
    }
  });
});
