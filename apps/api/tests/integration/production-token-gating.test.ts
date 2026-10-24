import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

// Force NODE_ENV=production for this whole file so BOTH production branches are
// exercised: the forgot-password response hides devToken/email (plan check §145)
// and the token console.log is suppressed (plan check §148 / spec §10, G3).
// importOriginal keeps every other env var (DATABASE_URL, JWT secrets) real.
vi.mock('../../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, NODE_ENV: 'production' as const },
  };
});

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { users } from '../../src/schema/index.js';

const d = (res: request.Response): any => res.body.data;

async function insertActiveWithPassword() {
  const stamp = randomUUID().slice(0, 8);
  const passwordHash = await bcrypt.hash('SomePass123!', 4);
  const [row] = await db
    .insert(users)
    .values({
      email: `prod-${stamp}@integration.test`,
      firstName: 'Prod',
      lastName: stamp,
      role: 'student',
      isActive: true,
      passwordHash,
    })
    .returning();
  return row;
}

let active: Awaited<ReturnType<typeof insertActiveWithPassword>>;

beforeAll(async () => {
  active = await insertActiveWithPassword();
});

afterAll(() => db.$client.end());

describe('POST /auth/forgot-password under NODE_ENV=production', () => {
  it('returns neither devToken nor email AND suppresses the token console.log', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: active.email });
      expect(res.status).toBe(200);

      const data = d(res);
      // Enumeration-safe production shape: constant 200, no token, no email.
      expect(data.devToken).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(typeof data.message).toBe('string');

      // §10 / G3: the [password-reset] token line never reaches stdout in
      // production. (The mailer's own "[mailer] …" info log is unrelated and
      // does not carry a token, so it is intentionally not asserted here.)
      const logged = logSpy.mock.calls
        .map((c) => (typeof c[0] === 'string' ? c[0] : ''))
        .join('\n');
      expect(logged).not.toContain('[password-reset]');
      expect(logged).not.toContain('token for');
    } finally {
      logSpy.mockRestore();
    }
  });
});
