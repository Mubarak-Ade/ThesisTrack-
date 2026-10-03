import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { hashPayload } from '../../src/middleware/idempotency.js';
import { createProposalSchema } from '../../src/modules/proposals/schema.js';
import {
  idempotencyKeys,
  proposals,
  submissionVersions,
  submissions,
  users,
} from '../../src/schema/index.js';

/**
 * Phase 8 integration suite — idempotency (spec §11.12, ADR-07) plus the
 * §11.0.2 `program` write path lives in `users-program.test.ts`.
 *
 * Drives the real Express app + real database through §11.12's algorithm on
 * all five honoured POSTs (proposals, submissions, submission versions,
 * users, users/import):
 *   - same key + identical payload → one record, the response replayed
 *     **byte-for-byte** (verbatim, including a reordered request body —
 *     payload identity is canonicalised);
 *   - same key + different payload → 409, the handler never runs;
 *   - different keys → independent records;
 *   - an absent header bypasses entirely (natural guards still apply);
 *   - a claimed-but-incomplete row → 409 "request in progress";
 *   - an expired key is reclaimed rather than replayed (24 h window);
 *   - multipart payloads hash the file's bytes too;
 *   - the `expires_at` sweep rides on login (plan 8.3 — no scheduler).
 *
 * Fixtures mint access tokens directly (same payload `signAccessToken`
 * produces) so the suite exercises the middleware, not the login flow —
 * except the sweep test, which logs in for real.
 */

interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

type ErrorBody = { code: string; message: string; details?: { path: string; message: string }[] };

const d = (res: request.Response): any => res.body.data;
const e = (res: request.Response): ErrorBody => res.body.error;

function tokenFor(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function createUser(role: Role): Promise<TestUser> {
  const stamp = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `${role}-${stamp.slice(0, 8)}@integration.test`,
      firstName: 'Idempotency',
      lastName: stamp.slice(0, 8),
      role,
      isActive: true,
    })
    .returning();
  return { id: row.id, email: row.email, role, token: tokenFor(row) };
}

const auth = (user: TestUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.token}`,
});

const key = (): string => `idem-${randomUUID()}`;

let admin: TestUser;
let st: TestUser; // proposal student (one in-flight proposal, I4)
let owner: TestUser; // owns the project — submissions / versions legs
let projectId: string;

beforeAll(async () => {
  admin = await createUser('administrator');
  st = await createUser('student');
  owner = await createUser('student');

  const project = await request(app)
    .post('/api/v1/projects')
    .set(auth(admin))
    .send({
      studentId: owner.id,
      title: 'Phase 8 — idempotency',
      description: 'Fixtures for the §11.12 suite.',
    });
  expect(project.status).toBe(201);
  projectId = d(project).project.id;
});

afterAll(() => db.$client.end());

describe('POST /proposals — §11.12 replay', () => {
  const KEY = key();
  const payload = {
    title: 'Idempotent proposal',
    abstract: 'One record only.',
    body: '<p>Full text.</p>',
  };
  let firstText = '';

  it('same key + identical payload → 201 replayed byte-for-byte, one record', async () => {
    const res1 = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st))
      .set('Idempotency-Key', KEY)
      .send(payload);
    expect(res1.status).toBe(201);
    firstText = res1.text;

    // Deliberately reordered keys — canonicalisation makes this the SAME
    // payload, so the second request must replay rather than 409.
    const reordered = { body: payload.body, title: payload.title, abstract: payload.abstract };
    const res2 = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st))
      .set('Idempotency-Key', KEY)
      .send(reordered);
    expect(res2.status).toBe(201);
    expect(res2.text).toBe(firstText); // verbatim: same status, same bytes
    expect(d(res2).proposal.id).toBe(d(res1).proposal.id);

    // Exactly one proposal …
    const rows = await db.select().from(proposals).where(eq(proposals.studentId, st.id));
    expect(rows).toHaveLength(1);
    // … and one key record, holding the stored response.
    const keys = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, KEY));
    expect(keys).toHaveLength(1);
    expect(keys[0].responseStatus).toBe(201);
    // Stored as { raw } — the exact bytes replayed on the next request.
    expect((keys[0].responseBody as { raw: string }).raw).toBe(firstText);
  });

  it('same key + different payload → 409, the handler never runs', async () => {
    const res = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st))
      .set('Idempotency-Key', KEY)
      .send({ ...payload, title: 'A different proposal entirely' });
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
    expect(e(res).message).toBe('key reused with a different payload');
    const rows = await db.select().from(proposals).where(eq(proposals.studentId, st.id));
    expect(rows).toHaveLength(1); // still only the first
  });

  it('an over-long key → 400 VALIDATION_ERROR (varchar(255) guard)', async () => {
    const res = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st))
      .set('Idempotency-Key', 'x'.repeat(256))
      .send(payload);
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details?.some((x) => x.path === 'Idempotency-Key')).toBe(true);
  });

  it('an absent header bypasses entirely — natural guards still apply', async () => {
    // Unkeyed, so the handler really runs and hits I4's in-flight rule —
    // proof the middleware was skipped, not that a replay happened.
    const res = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st))
      .send(payload);
    expect(res.status).toBe(409);
    expect(e(res).message).toBe('You already have a proposal in progress');
  });
});

describe('different keys → independent records', () => {
  it('two keyed submissions under two keys both run (201, 201)', async () => {
    const k1 = key();
    const k2 = key();
    const r1 = await request(app)
      .post('/api/v1/submissions')
      .set(auth(owner))
      .set('Idempotency-Key', k1)
      .send({ projectId, title: 'Keyed chapter A', body: '<p>One.</p>' });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/v1/submissions')
      .set(auth(owner))
      .set('Idempotency-Key', k2)
      .send({ projectId, title: 'Keyed chapter B', body: '<p>Two.</p>' });
    expect(r2.status).toBe(201);
    expect(d(r2).submission.id).not.toBe(d(r1).submission.id);

    const rows = await db.select().from(submissions).where(eq(submissions.projectId, projectId));
    expect(rows).toHaveLength(2);
    const keys = await db
      .select()
      .from(idempotencyKeys)
      .where(inArray(idempotencyKeys.key, [k1, k2]));
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.responseStatus)).toEqual([201, 201]);
  });
});

describe('multipart payloads hash the file bytes too', () => {
  const KEY = key();
  const fields = { projectId, title: 'File-keyed chapter' };

  it('same key + same file + same fields → replay, one submission', async () => {
    const r1 = await request(app)
      .post('/api/v1/submissions')
      .set(auth(owner))
      .set('Idempotency-Key', KEY)
      .field('projectId', projectId)
      .field('title', fields.title)
      .attach('file', Buffer.from('identical bytes for this test'), {
        filename: 'chapter.txt',
        contentType: 'text/plain',
      });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/v1/submissions')
      .set(auth(owner))
      .set('Idempotency-Key', KEY)
      .field('projectId', projectId)
      .field('title', fields.title)
      .attach('file', Buffer.from('identical bytes for this test'), {
        filename: 'chapter.txt',
        contentType: 'text/plain',
      });
    expect(r2.status).toBe(201);
    expect(r2.text).toBe(r1.text);

    // Scoped to this run's project — earlier runs left rows with this title.
    const rows = await db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.projectId, projectId), eq(submissions.title, fields.title)),
      );
    expect(rows).toHaveLength(1);
  });

  it('same key + different file bytes → 409 (the file is part of the payload)', async () => {
    const r3 = await request(app)
      .post('/api/v1/submissions')
      .set(auth(owner))
      .set('Idempotency-Key', KEY)
      .field('projectId', projectId)
      .field('title', fields.title)
      .attach('file', Buffer.from('DIFFERENT bytes entirely'), {
        filename: 'chapter.txt',
        contentType: 'text/plain',
      });
    expect(r3.status).toBe(409);
    expect(e(r3).message).toBe('key reused with a different payload');

    // Scoped to this run's project — earlier runs left rows with this title.
    const rows = await db
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.projectId, projectId), eq(submissions.title, fields.title)),
      );
    expect(rows).toHaveLength(1); // the second upload never ran
  });
});

describe('POST /submissions/:id/versions — replay, no second row', () => {
  it('same key twice → identical response, version count unchanged', async () => {
    const created = await request(app)
      .post('/api/v1/submissions')
      .set(auth(owner))
      .send({ projectId, title: 'Versioned chapter', body: '<p>v1</p>' });
    expect(created.status).toBe(201);
    const sid = d(created).submission.id;

    const KEY = key();
    const append = { body: '<p>v2 append.</p>' };
    const r1 = await request(app)
      .post(`/api/v1/submissions/${sid}/versions`)
      .set(auth(owner))
      .set('Idempotency-Key', KEY)
      .send(append);
    expect(r1.status).toBe(201);

    const afterFirst = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.submissionId, sid));
    expect(afterFirst.length).toBeGreaterThan(0);

    const r2 = await request(app)
      .post(`/api/v1/submissions/${sid}/versions`)
      .set(auth(owner))
      .set('Idempotency-Key', KEY)
      .send(append);
    expect(r2.status).toBe(201);
    expect(r2.text).toBe(r1.text);

    const afterSecond = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.submissionId, sid));
    expect(afterSecond).toHaveLength(afterFirst.length);
  });
});

describe('POST /users + POST /users/import — replay', () => {
  it('same key twice → identical response, one account provisioned', async () => {
    const KEY = key();
    const email = `idem-${randomUUID().slice(0, 8)}@integration.test`;
    const payload = { firstName: 'Idem', lastName: 'Potent', email, role: 'student' };

    const r1 = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .set('Idempotency-Key', KEY)
      .send(payload);
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .set('Idempotency-Key', KEY)
      .send(payload);
    expect(r2.status).toBe(201);
    expect(r2.text).toBe(r1.text); // incl. the one-time activationToken

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it('same key twice → the import batch provisions once', async () => {
    const KEY = key();
    const stamp = randomUUID().slice(0, 8);
    const batch = {
      users: [
        {
          firstName: 'Import',
          lastName: 'One',
          email: `idem-a-${stamp}@integration.test`,
          role: 'student',
        },
        {
          firstName: 'Import',
          lastName: 'Two',
          email: `idem-b-${stamp}@integration.test`,
          role: 'supervisor',
        },
      ],
    };

    const r1 = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .set('Idempotency-Key', KEY)
      .send(batch);
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .set('Idempotency-Key', KEY)
      .send(batch);
    expect(r2.status).toBe(201);
    expect(r2.text).toBe(r1.text);

    const rows = await db
      .select()
      .from(users)
      .where(
        inArray(users.email, [`idem-a-${stamp}@integration.test`, `idem-b-${stamp}@integration.test`]),
      );
    expect(rows).toHaveLength(2); // four inserts would mean a double-run
  });
});

describe('claim lifecycle (§11.12 steps 2b/3 + the 24 h window)', () => {
  it('claimed but incomplete → 409 "request in progress", nothing runs', async () => {
    const st2 = await createUser('student');
    const KEY = key();
    const payload = { title: 'In flight', abstract: 'Still running.', body: '<p>x</p>' };
    // The middleware hashes the VALIDATED body — same schema, same input.
    const validated = createProposalSchema.parse(payload);
    await db.insert(idempotencyKeys).values({
      key: KEY,
      userId: st2.id,
      endpoint: 'POST /api/v1/proposals',
      requestHash: hashPayload(validated),
      expiresAt: new Date(Date.now() + 3_600_000),
      // responseStatus omitted → NULL → in-flight (§11.12 2b)
    });

    const res = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st2))
      .set('Idempotency-Key', KEY)
      .send(payload);
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
    expect(e(res).message).toBe('request in progress');

    const rows = await db.select().from(proposals).where(eq(proposals.studentId, st2.id));
    expect(rows).toHaveLength(0); // the handler never ran
  });

  it('an expired key is reclaimed, not replayed (§11.12 24 h window)', async () => {
    const st3 = await createUser('student');
    const KEY = key();
    const payload = { title: 'Expired key', abstract: 'Reclaim me.', body: '<p>x</p>' };
    const validated = createProposalSchema.parse(payload);
    await db.insert(idempotencyKeys).values({
      key: KEY,
      userId: st3.id,
      endpoint: 'POST /api/v1/proposals',
      requestHash: hashPayload(validated),
      responseStatus: 418, // a stale body that must NOT be replayed
      responseBody: '{"stale":true}',
      expiresAt: new Date(Date.now() - 1_000),
    });

    const res = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st3))
      .set('Idempotency-Key', KEY)
      .send(payload);
    expect(res.status).toBe(201); // fresh run — the stale 418 is gone
    expect(d(res).proposal.title).toBe('Expired key');

    const keys = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, KEY));
    expect(keys).toHaveLength(1); // the expired row was replaced, not doubled
    expect(keys[0].responseStatus).toBe(201);
  });

  it('the expires_at sweep rides on login (plan 8.3 — no scheduler)', async () => {
    // A real password, so the sweep can be triggered through the login flow.
    const stamp = randomUUID().slice(0, 8);
    const email = `sweep-${stamp}@integration.test`;
    const passwordHash = await bcrypt.hash('SweepPass123!', 4);
    const [sweepAdmin] = await db
      .insert(users)
      .values({
        email,
        firstName: 'Sweep',
        lastName: 'Probe',
        role: 'administrator',
        isActive: true,
        passwordHash,
      })
      .returning();

    const expiredKey = key();
    const liveKey = key();
    await db.insert(idempotencyKeys).values([
      {
        key: expiredKey,
        userId: sweepAdmin.id,
        endpoint: 'POST /api/v1/users',
        requestHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        key: liveKey,
        userId: sweepAdmin.id,
        endpoint: 'POST /api/v1/users',
        requestHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'SweepPass123!' });
    expect(login.status).toBe(200);

    const keys = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, sweepAdmin.id));
    expect(keys.map((k) => k.key)).toEqual([liveKey]); // expired one swept
  });
});
