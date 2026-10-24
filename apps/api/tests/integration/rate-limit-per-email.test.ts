import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';

/**
 * Mailer design §9 (G4) — per-email window on POST /auth/forgot-password.
 *
 * All four requests target the SAME address, so the per-email window (3/address)
 * trips on the 4th. The per-IP window (5/IP) is only at 4 by then and CANNOT be
 * the cause — proving the per-email guard fires independently of the IP guard.
 *
 * This lives in its own file because vitest isolates each file's module graph →
 * a fresh in-memory rate-limit store per file.
 */

const FORGOT = '/api/v1/auth/forgot-password';
const PER_EMAIL_LIMIT = 3;

afterAll(() => db.$client.end());

describe('POST /auth/forgot-password — per-email rate limit', () => {
  it('allows PER_EMAIL_LIMIT requests to one address, then 429s (per-email window)', async () => {
    const email = `rl-email-${randomUUID().slice(0, 8)}@integration.test`;

    for (let i = 0; i < PER_EMAIL_LIMIT; i++) {
      const res = await request(app).post(FORGOT).send({ email });
      expect(res.status).toBe(200);
    }

    // 4th request to the same address → per-email window trips. The per-IP
    // window has only counted 4 (< 5) so far, so it is not the trigger.
    const blocked = await request(app).post(FORGOT).send({ email });
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(typeof blocked.body.error.message).toBe('string');
  });
});
