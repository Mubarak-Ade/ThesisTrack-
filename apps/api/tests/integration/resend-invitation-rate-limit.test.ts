import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';

/**
 * Shared abuse window — POST /auth/resend-invitation reuses the
 * forgot-password per-IP/per-email budget on purpose (both routes mail a
 * one-time secret to one address). Four requests to the SAME address → the
 * per-email window (3) trips on the 4th, with the per-IP window (5) only at
 * 4 and therefore not the cause.
 *
 * Own file → vitest module isolation gives this file a fresh in-memory
 * rate-limit store.
 */

const RESEND = '/api/v1/auth/resend-invitation';
const PER_EMAIL_LIMIT = 3;

afterAll(() => db.$client.end());

describe('POST /auth/resend-invitation — per-email rate limit', () => {
  it('allows PER_EMAIL_LIMIT requests to one address, then 429s (per-email window)', async () => {
    const email = `rl-invite-${randomUUID().slice(0, 8)}@integration.test`;

    for (let i = 0; i < PER_EMAIL_LIMIT; i++) {
      const res = await request(app).post(RESEND).send({ email });
      expect(res.status).toBe(200);
    }

    // 4th request to the same address → per-email window trips. The per-IP
    // window has only counted 4 (< 5) so far, so it is not the trigger.
    const blocked = await request(app).post(RESEND).send({ email });
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(typeof blocked.body.error.message).toBe('string');
  });
});
