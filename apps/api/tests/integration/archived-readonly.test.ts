import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { feedback, milestones, proposals, projects, submissions, users } from '../../src/schema/index.js';
import { patchProposal } from '../../src/modules/proposals/service.js';

/**
 * Post-run delta (spec §5.8): "Archived projects are read-only."
 *
 * The archive/restore affordance shipped at plan Phase 13.3, but the read-only
 * half of §5.8 was never enforced: nothing rejected writes to an archived
 * project. This suite pins the guard on every academic write path —
 * submissions (create/patch/submit/versions/delete), milestones
 * (create/patch/status/reorder/from-template), reviews, feedback
 * (create/patch/delete) and proposal edits — all answering 422
 * `BUSINESS_RULE_VIOLATION` with the §5.8 message, and proves the guard is
 * not sticky after a restore. The admin status PATCH itself (archive/restore)
 * stays legal — it is the affordance §5.8 describes, not a violation of it.
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
      email: `${role}-${stamp.slice(0, 8)}@archived-readonly.test`,
      firstName: 'ArchivedGuard',
      lastName: stamp.slice(0, 8),
      role,
      isActive: true,
    })
    .returning();
  return { id: row.id, email: row.email, role, token: tokenFor(row) };
}

let admin: TestUser;
let student: TestUser;
let projectId: string;
let submissionId: string;
let milestoneId: string;
let feedbackId: string;

/** The one assertion every blocked write shares (§5.8). */
function expectArchived(res: request.Response): void {
  expect(res.status).toBe(422);
  expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
  expect(e(res).message).toContain('archived');
  expect(e(res).message).toContain('read-only');
}

beforeAll(async () => {
  admin = await createUser('administrator');
  student = await createUser('student');

  const [project] = await db
    .insert(projects)
    .values({
      studentId: student.id,
      title: 'Archived read-only guard',
      description: 'Fixture project for the §5.8 enforcement suite',
      status: 'active',
    })
    .returning();
  projectId = project.id;

  const created = await request(app)
    .post('/api/v1/submissions')
    .set('Authorization', `Bearer ${student.token}`)
    .send({ projectId, title: 'Draft submission', body: 'draft body' });
  expect(created.status).toBe(201);
  const [subRow] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.projectId, projectId))
    .limit(1);
  submissionId = subRow.id;

  const ms = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ title: 'M1' });
  expect(ms.status).toBe(201);
  const [msRow] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .limit(1);
  milestoneId = msRow.id;

  const fb = await request(app)
    .post(`/api/v1/projects/${projectId}/feedback`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({ body: 'Project-thread feedback while active' });
  expect(fb.status).toBe(201);
  const [fbRow] = await db
    .select()
    .from(feedback)
    .where(eq(feedback.projectId, projectId))
    .limit(1);
  feedbackId = fbRow.id;

  const archived = await request(app)
    .patch(`/api/v1/projects/${projectId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ status: 'archived' });
  expect(archived.status).toBe(200);
});

afterAll(async () => {
  await db.$client.end();
});

describe('§5.8 — an archived project is read-only', () => {
  it('blocks submission create', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ projectId, title: 'Blocked', body: 'nope' });
    expectArchived(res);
  });

  it('blocks submission patch', async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ title: 'Renamed over the guard' });
    expectArchived(res);
  });

  it('blocks submission submit', async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/submit`)
      .set('Authorization', `Bearer ${student.token}`);
    expectArchived(res);
  });

  it('blocks a new submission version', async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/versions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ body: 'v2 over the guard' });
    expectArchived(res);
  });

  it('blocks submission delete', async () => {
    const res = await request(app)
      .delete(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${student.token}`);
    expectArchived(res);
  });

  it('blocks milestone create', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Blocked milestone' });
    expectArchived(res);
  });

  it('blocks milestone patch', async () => {
    const res = await request(app)
      .patch(`/api/v1/milestones/${milestoneId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Renamed over the guard' });
    expectArchived(res);
  });

  it('blocks a milestone status change', async () => {
    const res = await request(app)
      .post(`/api/v1/milestones/${milestoneId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'in_progress' });
    expectArchived(res);
  });

  it('blocks milestone reorder', async () => {
    const res = await request(app)
      .put(`/api/v1/projects/${projectId}/milestones/reorder`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ order: [milestoneId] });
    expectArchived(res);
  });

  it('blocks from-template ahead of template lookup — the guard is first', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones/from-template`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ templateId: randomUUID() }); // nonexistent template — the guard must answer first
    expectArchived(res);
  });

  it('blocks a review on an archived project’s submission', async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/reviews`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ decision: 'approved', comment: 'Over the guard' });
    expectArchived(res);
  });

  it('blocks feedback create on the project thread', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/feedback`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ body: 'Blocked feedback' });
    expectArchived(res);
  });

  it('blocks feedback patch', async () => {
    const res = await request(app)
      .patch(`/api/v1/feedback/${feedbackId}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ body: 'Edited over the guard' });
    expectArchived(res);
  });

  it('blocks feedback delete', async () => {
    const res = await request(app)
      .delete(`/api/v1/feedback/${feedbackId}`)
      .set('Authorization', `Bearer ${student.token}`);
    expectArchived(res);
  });

  it('blocks proposal edits once the proposal owns the archived project (service guard)', async () => {
    // The only proposal state that carries a `projectId` is the approved one
    // (§8.3) — an unreachable-over-HTTP state for edits, so the defense-in-depth
    // line is exercised at the service seam, where it must fire before the
    // §5.4 state machine.
    const [row] = await db
      .insert(proposals)
      .values({
        studentId: student.id,
        projectId,
        title: 'Approved proposal',
        abstract: 'An abstract',
        body: '<p>frozen</p>',
        status: 'approved',
        version: 1,
      })
      .returning();
    await expect(patchProposal(row, { title: 'Edited over the guard' })).rejects.toThrow(
      /archived.*read-only/,
    );
  });

  it('the admin archive/restore PATCH itself stays legal — restore re-enables writes', async () => {
    const restored = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'active' });
    expect(restored.status).toBe(200);
    expect(d(restored).project.status).toBe('active');

    const patched = await request(app)
      .patch(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ title: 'Writable again after restore' });
    expect(patched.status).toBe(200);

    const ms = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Post-restore milestone' });
    expect(ms.status).toBe(201);
  });
});
