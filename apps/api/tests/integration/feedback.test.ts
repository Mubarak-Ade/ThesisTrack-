import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { feedback, users } from '../../src/schema/index.js';

/**
 * Phase 6 integration suite — feedback (spec §11.7, §4.5, §13.3, baseline §23).
 *
 * Drives the real Express app + real database through the discussion half of
 * the module pair: project- and submission-scoped threads, any-participant
 * creation, §4.5 authorship rules (edit own / delete own / admin delete any),
 * and ADR-14 sanitization. `Feedback` is discussion, never a decision — the
 * row has no decision column and the view has no decision field.
 *
 * Fixtures mint access tokens directly (same payload `signAccessToken`
 * produces) so the suite exercises authorization, not the login flow.
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
      firstName: 'Integration',
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

let admin: TestUser;
let sup1: TestUser; // assigned to st1
let sup2: TestUser; // assigned to nobody
let st1: TestUser;
let st2: TestUser;

let projectId: string;
let submissionId: string;

const projectPath = (): string => `/api/v1/projects/${projectId}/feedback`;
const submissionPath = (): string => `/api/v1/submissions/${submissionId}/feedback`;

function postFeedback(
  user: TestUser,
  path: string,
  body: Record<string, unknown> = {},
): Promise<request.Response> {
  return request(app).post(path).set(auth(user)).send(body);
}

beforeAll(async () => {
  admin = await createUser('administrator');
  sup1 = await createUser('supervisor');
  sup2 = await createUser('supervisor');
  st1 = await createUser('student');
  st2 = await createUser('student');

  // Assignment BEFORE the project exists (ADR-12/ADR-13).
  const assigned = await request(app)
    .post(`/api/v1/students/${st1.id}/supervisor`)
    .set(auth(admin))
    .send({ supervisorId: sup1.id });
  expect(assigned.status).toBe(201);

  const project = await request(app)
    .post('/api/v1/projects')
    .set(auth(admin))
    .send({
      studentId: st1.id,
      title: 'Phase 6 — feedback',
      description: 'Integration fixture for the feedback module.',
    });
  expect(project.status).toBe(201);
  projectId = d(project).project.id;

  const created = await postFeedback(st1, '/api/v1/submissions', {
    projectId,
    title: 'Discussion fixture',
    body: '<p>Text to discuss.</p>',
  });
  expect(created.status).toBe(201);
  submissionId = d(created).submission.id;
  const submitted = await request(app)
    .post(`/api/v1/submissions/${submissionId}/submit`)
    .set(auth(st1));
  expect(submitted.status).toBe(201);
});

afterAll(async () => {
  await db.$client.end();
});

/* ========================================================================= */

describe('project thread (§11.7)', () => {
  it('the owner creates discussion — Feedback carries no decision (baseline §23)', async () => {
    const res = await postFeedback(st1, projectPath(), { body: '<p>When is the review?</p>' });
    expect(res.status).toBe(201);
    expect(d(res).feedback).toMatchObject({
      projectId,
      submissionId: null,
      body: '<p>When is the review?</p>',
      author: { id: st1.id, role: 'student' },
    });
    expect('decision' in d(res).feedback).toBe(false);
  });

  it('the assigned supervisor and the administrator may discuss too (403 for nobody)', async () => {
    expect(
      (await postFeedback(sup1, projectPath(), { body: '<p>Thursday.</p>' })).status,
    ).toBe(201);
    expect(
      (await postFeedback(admin, projectPath(), { body: '<p>Lab open 9–17.</p>' })).status,
    ).toBe(201);
  });

  it('refuses non-participants — another student and an unassigned supervisor (403)', async () => {
    expect((await postFeedback(st2, projectPath(), { body: '<p>Hi.</p>' })).status).toBe(403);
    expect((await postFeedback(sup2, projectPath(), { body: '<p>Hi.</p>' })).status).toBe(403);

    const reads = await request(app).get(projectPath()).set(auth(st2));
    expect(reads.status).toBe(403);
  });

  it('lists the project thread oldest first with authors as PublicUsers', async () => {
    const res = await request(app).get(projectPath()).set(auth(st1));
    expect(res.status).toBe(200);
    const list = d(res).feedback;
    expect(list.length).toBe(3);
    expect(list.map((f: any) => f.author.id)).toEqual([st1.id, sup1.id, admin.id]); // chronological
    expect(list[0].submissionId).toBeNull();
    expect(list[0].author).toMatchObject({ email: st1.email });
    expect((await request(app).get(projectPath()).set(auth(admin))).status).toBe(200);
  });

  it('answers 404 for an unknown project and 400 for a malformed one (§13.5)', async () => {
    const unknown = await request(app)
      .get(`/api/v1/projects/${randomUUID()}/feedback`)
      .set(auth(st1));
    expect(unknown.status).toBe(404);

    const malformed = await request(app).get('/api/v1/projects/nope/feedback').set(auth(st1));
    expect(malformed.status).toBe(400);
    expect(e(malformed)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

/* ========================================================================= */

describe('submission thread (§11.7)', () => {
  it('the owner creates discussion scoped to the submission, projectId derived', async () => {
    const res = await postFeedback(st1, submissionPath(), { body: '<p>See v2, §2 fixed.</p>' });
    expect(res.status).toBe(201);
    expect(d(res).feedback).toMatchObject({
      projectId, // from the submission row, never from the body
      submissionId,
      author: { id: st1.id },
    });
  });

  it('the assigned supervisor replies on the submission (201)', async () => {
    expect(
      (await postFeedback(sup1, submissionPath(), { body: '<p>Reading now.</p>' })).status,
    ).toBe(201);
  });

  it('keeps the two threads separate — submission rows never appear on the project list', async () => {
    const onSubmission = await request(app).get(submissionPath()).set(auth(st1));
    expect(onSubmission.status).toBe(200);
    expect(d(onSubmission).feedback).toHaveLength(2);

    const onProject = await request(app).get(projectPath()).set(auth(st1));
    expect(onProject.status).toBe(200);
    expect(d(onProject).feedback).toHaveLength(3); // unchanged: project thread only
    expect(d(onProject).feedback.every((f: any) => f.submissionId === null)).toBe(true);
  });

  it('refuses non-participants (403) and an unassigned supervisor (403)', async () => {
    expect((await request(app).get(submissionPath()).set(auth(st2))).status).toBe(403);
    expect((await request(app).get(submissionPath()).set(auth(sup2))).status).toBe(403);
    expect((await postFeedback(st2, submissionPath(), { body: '<p>Nope.</p>' })).status).toBe(403);
    expect((await postFeedback(sup2, submissionPath(), { body: '<p>Nope.</p>' })).status).toBe(403);
    expect((await request(app).get(submissionPath()).set(auth(admin))).status).toBe(200);
  });

  it('answers 404 for an unknown submission and 400 for a malformed one', async () => {
    const unknown = await request(app)
      .get(`/api/v1/submissions/${randomUUID()}/feedback`)
      .set(auth(st1));
    expect(unknown.status).toBe(404);

    const malformed = await request(app)
      .get('/api/v1/submissions/nope/feedback')
      .set(auth(st1));
    expect(malformed.status).toBe(400);
  });
});

/* ========================================================================= */

describe('authorship rules (§4.5)', () => {
  async function ownRow(): Promise<string> {
    const res = await postFeedback(st1, projectPath(), { body: '<p>Mine.</p>' });
    expect(res.status).toBe(201);
    return d(res).feedback.id;
  }

  it('the author edits their own feedback (200) and updatedAt advances', async () => {
    const id = await ownRow();
    const res = await request(app)
      .patch(`/api/v1/feedback/${id}`)
      .set(auth(st1))
      .send({ body: '<p>Mine, corrected.</p>' });
    expect(res.status).toBe(200);
    expect(d(res).feedback.body).toBe('<p>Mine, corrected.</p>');
    expect(d(res).feedback.author.id).toBe(st1.id);
    expect(new Date(d(res).feedback.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(d(res).feedback.createdAt).getTime(),
    );
  });

  it('an administrator edits only their OWN feedback — not someone else’s (403)', async () => {
    const id = await ownRow();
    const res = await request(app)
      .patch(`/api/v1/feedback/${id}`)
      .set(auth(admin))
      .send({ body: '<p>Admin edit.</p>' });
    expect(res.status).toBe(403);
    expect(e(res)).toMatchObject({ code: 'AUTHORIZATION_ERROR' });

    const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
    expect(row.body).toBe('<p>Mine.</p>'); // untouched
  });

  it('the assigned supervisor cannot edit the student’s feedback (403)', async () => {
    const id = await ownRow();
    expect(
      (
        await request(app)
          .patch(`/api/v1/feedback/${id}`)
          .set(auth(sup1))
          .send({ body: '<p>Supervisor edit.</p>' })
      ).status,
    ).toBe(403);
  });

  it('the author deletes their own feedback (200) and the row is gone', async () => {
    const id = await ownRow();
    const res = await request(app).delete(`/api/v1/feedback/${id}`).set(auth(st1));
    expect(res.status).toBe(200);
    expect(d(res).feedback).toMatchObject({ id, author: { id: st1.id } });

    const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
    expect(row).toBeUndefined();
    const list = await request(app).get(projectPath()).set(auth(st1));
    expect(d(list).feedback.some((f: any) => f.id === id)).toBe(false);
  });

  it('an administrator deletes any feedback (200)', async () => {
    const id = await ownRow();
    const res = await request(app).delete(`/api/v1/feedback/${id}`).set(auth(admin));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
    expect(row).toBeUndefined();
  });

  it('the assigned supervisor cannot delete the student’s feedback (403)', async () => {
    const id = await ownRow();
    const res = await request(app).delete(`/api/v1/feedback/${id}`).set(auth(sup1));
    expect(res.status).toBe(403);
    const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
    expect(row).toBeDefined();
  });

  it('answers 404 for unknown ids and 400 for malformed ones (§13.5)', async () => {
    const unknown = randomUUID();
    expect(
      (await request(app).patch(`/api/v1/feedback/${unknown}`).set(auth(st1)).send({ body: 'x' }))
        .status,
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/v1/feedback/${unknown}`).set(auth(st1))).status,
    ).toBe(404);

    const malformed = await request(app).patch('/api/v1/feedback/nope').set(auth(st1));
    expect(malformed.status).toBe(400);
    expect(e(malformed)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

/* ========================================================================= */

describe('body rules (§11.7, ADR-14)', () => {
  it('requires a body — missing or whitespace-only is 400 path body', async () => {
    const missing = await postFeedback(st1, projectPath());
    expect(missing.status).toBe(400);
    expect(e(missing).details?.[0]?.path).toBe('body');

    const blank = await postFeedback(st1, projectPath(), { body: '   ' });
    expect(blank.status).toBe(400);
    expect(e(blank).details?.[0]?.path).toBe('body');
  });

  it('refuses markup that cleans to nothing (400 path body)', async () => {
    const res = await postFeedback(st1, projectPath(), { body: '<p></p>' });
    expect(res.status).toBe(400);
    expect(e(res)).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(e(res).details?.[0]).toMatchObject({ path: 'body', message: 'Body is empty' });
  });

  it('sanitizes on write — no script tag survives into the row (ADR-14)', async () => {
    const res = await postFeedback(st1, projectPath(), {
      body: '<p>Chapter note</p><script>alert(1)</script>',
    });
    expect(res.status).toBe(201);
    const body = d(res).feedback.body;
    expect(body).toContain('Chapter note');
    expect(body).not.toContain('<script');

    const [row] = await db.select().from(feedback).where(eq(feedback.id, d(res).feedback.id));
    expect(row.body).not.toContain('<script'); // the STORED row is clean
  });

  it('applies the same rule on edit (400 path body)', async () => {
    const created = await postFeedback(st1, projectPath(), { body: '<p>Edit me.</p>' });
    const id = d(created).feedback.id;
    const res = await request(app)
      .patch(`/api/v1/feedback/${id}`)
      .set(auth(st1))
      .send({ body: '<img src=x onerror=alert(1)>' });
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('body');
  });
});
