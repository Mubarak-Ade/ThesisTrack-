import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { users } from '../../src/schema/index.js';

/**
 * Orphan-account prevention — POST /auth/resend-invitation response shape.
 *
 * Mirrors forgot-password-response.test.ts: outside production a REAL hit
 * (never-activated account only) carries devToken AND the correlated email,
 * while unknown emails, active accounts and deactivated accounts all get the
 * byte-identical constant-200 body with neither field — enumeration-safe
 * either way, and a deactivated (formerly active) account can never
 * self-resurrect through this route.
 *
 * Request budget: this file makes exactly 5 calls — the per-IP window on the
 * shared forgot-password limiter is 5, so the 5th still passes. Add cases
 * with that ceiling in mind (vitest isolates each file's limiter store).
 */

const d = (res: request.Response): any => res.body.data;
const SAME_MESSAGE =
  'If an invitation is pending for that email, a new invitation link has been sent.';

async function insertUser(opts: { isActive: boolean; withPassword?: boolean }) {
  const stamp = randomUUID().slice(0, 8);
  const passwordHash = opts.withPassword ? await bcrypt.hash('SomePass123!', 4) : null;
  const [row] = await db
    .insert(users)
    .values({
      email: `invite-${stamp}@integration.test`,
      firstName: 'Invite',
      lastName: stamp,
      role: 'student',
      isActive: opts.isActive,
      passwordHash,
    })
    .returning();
  return row;
}

let invited: Awaited<ReturnType<typeof insertUser>>;
let active: Awaited<ReturnType<typeof insertUser>>;
let deactivated: Awaited<ReturnType<typeof insertUser>>;

beforeAll(async () => {
  invited = await insertUser({ isActive: false });
  active = await insertUser({ isActive: true, withPassword: true });
  deactivated = await insertUser({ isActive: false, withPassword: true });
});

afterAll(() => db.$client.end());

describe('POST /auth/resend-invitation — dev response shape', () => {
  it('returns devToken for a never-activated account and rotates it on resend (latest wins)', async () => {
    const first = await request(app)
      .post('/api/v1/auth/resend-invitation')
      .send({ email: invited.email });
    expect(first.status).toBe(200);
    expect(d(first).message).toBe(SAME_MESSAGE);
    expect(typeof d(first).devToken).toBe('string');
    expect(d(first).email).toBe(invited.email);

    // A second request issues a NEW token; the fresh one supersedes the old.
    const second = await request(app)
      .post('/api/v1/auth/resend-invitation')
      .send({ email: invited.email });
    expect(second.status).toBe(200);
    expect(d(second).devToken).toBeTruthy();
    expect(d(second).devToken).not.toBe(d(first).devToken);

    // The freshly issued token previews through the public endpoint.
    const preview = await request(app).get(`/api/v1/auth/invitation/${d(second).devToken}`);
    expect(preview.status).toBe(200);
  });

  it('unknown email → constant-200 with neither token field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-invitation')
      .send({ email: `ghost-${randomUUID().slice(0, 8)}@integration.test` });
    expect(res.status).toBe(200);
    expect(d(res).message).toBe(SAME_MESSAGE);
    expect(d(res).devToken).toBeUndefined();
    expect(d(res).email).toBeUndefined();
  });

  it('active account → constant-200 with neither token field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-invitation')
      .send({ email: active.email });
    expect(res.status).toBe(200);
    expect(d(res).message).toBe(SAME_MESSAGE);
    expect(d(res).devToken).toBeUndefined();
  });

  it('deactivated (formerly active) account → constant-200, no token — cannot self-resurrect', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-invitation')
      .send({ email: deactivated.email });
    expect(res.status).toBe(200);
    expect(d(res).message).toBe(SAME_MESSAGE);
    expect(d(res).devToken).toBeUndefined();
  });
});
