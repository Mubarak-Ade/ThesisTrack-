import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { milestones, reviews, submissions, users } from '../../src/schema/index.js';
import * as reviewRepo from '../../src/modules/reviews/repository.js';

/**
 * Phase 6 integration suite — reviews (spec §11.6, §5.5, §4.5, §13.3, I8).
 *
 * Drives the real Express app + real database through the review half of
 * §5.5: who may decide (assigned supervisor / admin, never a student), the
 * three input statuses, the decision → submission transition, the `approved`
 * milestone side effect, cross-submission history reads, and I8 — reviews
 * are append-only, so the routes to mutate one must not exist at all.
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
let milestoneA: { id: string };
let milestoneB: { id: string };

/** The first review created — reused by the I8 route-absence assertions. */
let firstReviewId = '';

/** Creates a submission owned by st1 (draft). */
async function newSubmission(payload: Record<string, unknown>): Promise<request.Response> {
  return request(app)
    .post('/api/v1/submissions')
    .set(auth(st1))
    .send({ projectId, ...payload });
}

/** Creates a submission and submits it — the §11.6 happy input. */
async function submitted(title: string, milestoneId?: string): Promise<string> {
  const created = await newSubmission({ title, ...(milestoneId ? { milestoneId } : {}) });
  expect(created.status).toBe(201);
  const id = d(created).submission.id;
  const res = await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(st1));
  expect(res.status).toBe(201);
  return id;
}

function postReview(
  user: TestUser,
  submissionId: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .post(`/api/v1/submissions/${submissionId}/reviews`)
    .set(auth(user))
    .send(body);
}

beforeAll(async () => {
  admin = await createUser('administrator');
  sup1 = await createUser('supervisor');
  sup2 = await createUser('supervisor');
  st1 = await createUser('student');
  st2 = await createUser('student');

  // Assignment BEFORE the project exists (ADR-12/ADR-13); the admin project
  // flow back-fills `project_id`, which is what makes sup1 a participant.
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
      title: 'Phase 6 — reviews',
      description: 'Integration fixture for the reviews module.',
    });
  expect(project.status).toBe(201);
  projectId = d(project).project.id;

  const [a, b] = await db
    .insert(milestones)
    .values([
      { projectId, title: 'Chapter 1', position: 0, dueAt: new Date(Date.now() + 604_800_000) },
      { projectId, title: 'Chapter 2', position: 1, dueAt: new Date(Date.now() + 1_209_600_000) },
    ])
    .returning();
  milestoneA = a;
  milestoneB = b;
});

afterAll(async () => {
  await db.$client.end();
});

/* ========================================================================= */

describe('creating a review: §11.6 decisions drive §5.5', () => {
  let approvedSubmission = '';

  it('approved → submission approved, tied milestone approved with completedAt', async () => {
    approvedSubmission = await submitted('Chapter one', milestoneA.id);

    const res = await postReview(sup1, approvedSubmission, {
      decision: 'approved',
      comment: 'Solid chapter — approved.',
    });
    expect(res.status).toBe(201);
    expect(d(res).review).toMatchObject({
      submissionId: approvedSubmission,
      proposalId: null,
      decision: 'approved',
      comment: 'Solid chapter — approved.',
    });
    expect(d(res).review.reviewer).toMatchObject({ id: sup1.id, role: 'supervisor' });
    expect(d(res).submission).toMatchObject({ id: approvedSubmission, status: 'approved' });
    firstReviewId = d(res).review.id;

    // §5.5: "milestone → approved, completedAt set"
    const [milestone] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, milestoneA.id));
    expect(milestone.status).toBe('approved');
    expect(milestone.completedAt).not.toBeNull();
  });

  it('revision_required → submission revision_required, milestone untouched; the revision loop closes', async () => {
    const sub = await submitted('Chapter two', milestoneB.id);

    const res = await postReview(sup1, sub, { decision: 'revision_required', comment: 'Tighten §2.' });
    expect(res.status).toBe(201);
    expect(d(res).submission).toMatchObject({ status: 'revision_required' });

    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneB.id));
    expect(milestone.status).toBe('pending'); // no approval, no side effect
    expect(milestone.completedAt).toBeNull();

    // §5.5's revision arrow: the student appends, status returns to submitted.
    const append = await request(app)
      .post(`/api/v1/submissions/${sub}/versions`)
      .set(auth(st1))
      .send({ body: '<p>Chapter two, revised.</p>' });
    expect(append.status).toBe(201);
    expect(d(append).submission.status).toBe('submitted');

    // …and a second review can now land (two reviews = the newest-first read).
    const second = await postReview(sup1, sub, { decision: 'approved', comment: 'Better.' });
    expect(second.status).toBe(201);
    expect(d(second).submission.status).toBe('approved');
    expect(
      (await db.select().from(milestones).where(eq(milestones.id, milestoneB.id)))[0].status,
    ).toBe('approved');
  });

  it('rejected → submission rejected, and a decided submission refuses further reviews (422 path status)', async () => {
    const sub = await submitted('Chapter three');

    const res = await postReview(sup1, sub, { decision: 'rejected', comment: 'Off brief.' });
    expect(res.status).toBe(201);
    expect(d(res).submission.status).toBe('rejected');

    const again = await postReview(sup1, sub, { decision: 'approved' });
    expect(again.status).toBe(422);
    expect(e(again)).toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    expect(e(again).details?.[0]?.path).toBe('status');
  });

  it('refuses a review of a draft (§11.6 input statuses, 422 path status)', async () => {
    const created = await newSubmission({ title: 'Never submitted' });
    expect(created.status).toBe(201);

    const res = await postReview(sup1, d(created).submission.id, { decision: 'approved' });
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]).toMatchObject({ path: 'status' });
    expect(e(res).details?.[0].message).toContain("not permitted from status 'draft'");

    const [row] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, d(created).submission.id));
    expect(row.status).toBe('draft'); // nothing moved
  });
});

/* ========================================================================= */

describe('who may review (§4.5, §13.3, I10)', () => {
  let target = '';

  beforeAll(async () => {
    target = await submitted('Authorization fixture');
  });

  it('refuses the student owner — nobody reviews their own work (403)', async () => {
    const res = await postReview(st1, target, { decision: 'approved' });
    expect(res.status).toBe(403);
    expect(e(res)).toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('refuses another student (403)', async () => {
    expect((await postReview(st2, target, { decision: 'approved' })).status).toBe(403);
  });

  it('refuses an unassigned supervisor — I10 (403)', async () => {
    const res = await postReview(sup2, target, { decision: 'approved' });
    expect(res.status).toBe(403);
    // The submission exists; access is what fails (§13.5 never masks).
    expect(
      (await request(app).get(`/api/v1/submissions/${target}`).set(auth(sup1))).status,
    ).toBe(200);
  });

  it('lets an administrator review (201)', async () => {
    const res = await postReview(admin, target, { decision: 'approved', comment: 'Approved.' });
    expect(res.status).toBe(201);
    expect(d(res).review.reviewer).toMatchObject({ id: admin.id, role: 'administrator' });
  });

  it('answers 404 for an unknown submission and 400 for a malformed one (§13.5)', async () => {
    const unknown = await postReview(sup1, randomUUID(), { decision: 'approved' });
    expect(unknown.status).toBe(404);
    expect(e(unknown)).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const malformed = await postReview(sup1, 'nope', { decision: 'approved' });
    expect(malformed.status).toBe(400);
    expect(e(malformed)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('validates the body (400 path decision)', async () => {
    const res = await postReview(sup1, target, { decision: 'looks-great' });
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('decision');
  });
});

/* ========================================================================= */

describe('reading reviews (§11.6)', () => {
  let withTwo = '';

  beforeAll(async () => {
    // Submissions reviewed in earlier tests already exist; find them by title.
    const rows = await db.query.submissions.findMany({
      where: eq(submissions.projectId, projectId),
    });
    const revisioned = rows.find((r) => r.title === 'Chapter two' && r.status === 'approved');
    withTwo = revisioned!.id;
  });

  it('lists a submission’s reviews newest first with the reviewer as a PublicUser', async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${withTwo}/reviews`)
      .set(auth(st1));
    expect(res.status).toBe(200);
    const list = d(res).reviews;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].decision).toBe('approved'); // newest first
    expect(list[1].decision).toBe('revision_required');
    expect(list[0].reviewer).toMatchObject({ id: sup1.id, email: sup1.email });
    expect(Object.keys(list[0].reviewer)).toEqual(
      expect.arrayContaining(['id', 'email', 'firstName', 'lastName', 'role']),
    );
  });

  it('exposes the cross-submission history for the project, each entry naming its submission', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reviews`)
      .set(auth(admin));
    expect(res.status).toBe(200);
    const list = d(res).reviews;
    expect(list.length).toBeGreaterThanOrEqual(3);
    const submissionIds = new Set(list.map((r: any) => r.submission.id));
    expect(submissionIds.size).toBeGreaterThanOrEqual(2); // cross-submission
    for (const r of list) {
      expect(r.submission).toMatchObject({ title: expect.any(String), status: expect.any(String) });
      expect(r.reviewer).toMatchObject({ id: expect.any(String) });
      expect(r.proposalId).toBeNull(); // these are submission reviews (§11.6)
    }
  });

  it('denies non-participants on both reads (403) and lets the administrator through', async () => {
    const sub = (await db.query.submissions.findFirst({
      where: eq(submissions.projectId, projectId),
    }))!;
    expect(
      (await request(app).get(`/api/v1/submissions/${sub.id}/reviews`).set(auth(st2))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/submissions/${sub.id}/reviews`).set(auth(sup2))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/projects/${projectId}/reviews`).set(auth(st2))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/projects/${projectId}/reviews`).set(auth(sup1))).status,
    ).toBe(200);
  });
});

/* ========================================================================= */

describe('append-only: no mutation route or function exists (I8, §11.6)', () => {
  const paths = (): Array<[string, string]> => [
    ['patch', `/api/v1/reviews/${firstReviewId}`],
    ['put', `/api/v1/reviews/${firstReviewId}`],
    ['delete', `/api/v1/reviews/${firstReviewId}`],
    ['post', `/api/v1/reviews/${firstReviewId}`],
  ];

  it('answers 404 — not 403 — for every hypothetical review mutation', async () => {
    expect(firstReviewId).not.toBe(''); // the earlier test recorded one
    for (const [method, path] of paths()) {
      const res = await (request(app) as any)[method](path).set(auth(admin));
      expect(`${method.toUpperCase()} ${path} → ${res.status}`).toBe(
        `${method.toUpperCase()} ${path} → 404`,
      );
    }
  });

  it('answers 404 on the collection too — the row-level routes are absent', async () => {
    const sub = await db.query.submissions.findFirst({
      where: eq(submissions.projectId, projectId),
    });
    for (const method of ['patch', 'delete'] as const) {
      const res = await (request(app) as any)[method](
        `/api/v1/submissions/${sub!.id}/reviews`,
      ).set(auth(sup1));
      expect(res.status).toBe(404);
    }
    // …while the documented GET/POST collection routes answer properly.
    expect(
      (await request(app).get(`/api/v1/submissions/${sub!.id}/reviews`).set(auth(sup1))).status,
    ).toBe(200);
  });

  it('exports no update/delete path for reviews from the repository', () => {
    const names = Object.keys(reviewRepo);
    expect(names).toContain('insertReview');
    expect(names).toContain('listReviewsForSubmission');
    // Nothing whose name targets a review row for mutation.
    expect(
      names.filter((n) => /^(update|delete|patch|remove|edit)/i.test(n) && /review/i.test(n)),
    ).toEqual([]);
    expect(names).not.toContain('updateReview');
    expect(names).not.toContain('deleteReview');
  });

  it('leaves the stored row byte-identical after every mutation attempt', async () => {
    const before = await db.query.reviews.findFirst({
      where: eq(reviews.id, firstReviewId),
    });
    expect(before).toBeDefined();

    await request(app)
      .patch(`/api/v1/reviews/${firstReviewId}`)
      .set(auth(admin))
      .send({ decision: 'rejected' });

    const after = await db.query.reviews.findFirst({
      where: eq(reviews.id, firstReviewId),
    });
    expect(after).toEqual(before);
  });
});
