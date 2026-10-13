import { describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { API_PREFIX } from '../../src/config/paths.js';

/**
 * Deployment contract test (spec §18.7, plan 15.2/15.4).
 *
 * `GET /api/v1/health` is the endpoint the compose/Docker healthchecks poll
 * and the §18.7 monitoring probe hits every 60 s. Two properties matter for
 * operations and are asserted here:
 *
 *   1. It answers 200 with the success envelope and a parseable timestamp.
 *   2. It is PUBLIC — no Authorization header. An operator (or a container
 *      healthcheck) must be able to probe it without a token, which is
 *      exactly why it sits in middleware/auth.ts's allowlist.
 */
describe('GET /health (§18.7)', () => {
  it('returns 200 with the success envelope, unauthenticated', async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(Number.isNaN(Date.parse(res.body.data.timestamp))).toBe(false);
  });

  it('is mounted under the shared API prefix, not a bare /health', async () => {
    // The bare path must NOT serve health: the auth middleware rejects the
    // unauthenticated request (401) before the 404 handler would see it, and
    // an authenticated request falls through to 404. Either way the contract
    // holds — health lives only under API_PREFIX (guards the prefix drifting).
    const bare = await request(app).get('/health');
    expect(bare.status).not.toBe(200);

    const prefixed = await request(app).get(`${API_PREFIX}/health`);
    expect(prefixed.status).toBe(200);
  });
});
