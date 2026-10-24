import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';

/**
 * Mailer design §9 (G4) — per-IP window on POST /auth/forgot-password.
 *
 * Every request here uses a DISTINCT email, so the per-email window (3/address)
 * can never trip (each address is seen once). The 6th request can therefore only
 * be rejected by the per-IP window (5/IP/15 min), proving it independently.
 *
 * This lives in its own file because vitest isolates each file's module graph →
 * a fresh in-memory rate-limit store per file.
 */

const FORGOT = '/api/v1/auth/forgot-password';
const PER_IP_LIMIT = 5;

afterAll(() => db.$client.end());

describe('POST /auth/forgot-password — per-IP rate limit', () => {
  it('allows PER_IP_LIMIT distinct requests, then 429s in the standard envelope', async () => {
    const statuses: number[] = [];

    for (let i = 0; i <= PER_IP_LIMIT; i++) {
      const res = await request(app)
        .post(FORGOT)
        .send({ email: `rl-ip-${i}-${randomUUID().slice(0, 8)}@integration.test` });
      statuses.push(res.status);

      if (i < PER_IP_LIMIT) {
        expect(res.status).toBe(200);
      } else {
        // 6th request from the same IP → per-IP window trips.
        expect(res.status).toBe(429);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('RATE_LIMITED');
        expect(typeof res.body.error.message).toBe('string');
        expect(res.body.error.details).toBeUndefined();
      }
    }

    expect(statuses.slice(0, PER_IP_LIMIT)).toEqual(Array(PER_IP_LIMIT).fill(200));
    expect(statuses[PER_IP_LIMIT]).toBe(429);
  });
});
