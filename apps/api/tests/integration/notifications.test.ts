import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { milestones, notifications, users } from '../../src/schema/index.js';

/**
 * Phase 7 integration suite — notifications (spec §11.8, §15.2, §15.4).
 *
 * Drives the real Express app + real database through:
 *   - recipient resolution for every §15.2 trigger wired in tasks 7.2/7.3,
 *     including the two milestone-completion paths (changeStatus and §5.5's
 *     review side effect);
 *   - the unread count and `?unread=true` filter staying in step with
 *     mark-read / read-all;
 *   - §11.8's isolation rule — another user's row is **404, not 403**;
 *   - task 7.4's deadline materialisation: computed on read, idempotent
 *     across polls, scoped to owner + assigned supervisor, and never issued
 *     for approved or far-future milestones.
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
let sup1: TestUser; // assigned to st1 (P1) — and, mid-suite, to st2
let sup2: TestUser; // assigned to nobody at fixture time
let sup3: TestUser; // assigned to st3 (proposal-approval fixture)
let st1: TestUser; // owns P1
let st2: TestUser; // no project — the "supervisor changed" fixture
let st3: TestUser; // no project — the approval fixture

let projectId: string;
let assignmentId = ''; // st1 ↔ sup1, from the beforeAll assign
let changedAssignmentId = ''; // st2 ↔ sup1, from the change test

// Carried between tests: a student may hold only ONE in-flight proposal (I4),
// so the submit → revision → rejected arc runs on a single row, sequentially.
let proposalA = '';
let submissionId = '';

async function fetchNotifs(
  user: TestUser,
  qs = '',
): Promise<{ list: any[]; total: number; page: number; limit: number }> {
  const res = await request(app).get(`/api/v1/notifications${qs}`).set(auth(user));
  expect(res.status).toBe(200);
  return {
    list: d(res).notifications,
    total: d(res).pagination.total,
    page: d(res).pagination.page,
    limit: d(res).pagination.limit,
  };
}

async function unread(user: TestUser): Promise<number> {
  const res = await request(app).get('/api/v1/notifications/unread-count').set(auth(user));
  expect(res.status).toBe(200);
  return d(res).unreadCount;
}

const ofType = (list: any[], type: string): any[] => list.filter((n) => n.type === type);
const withResource = (list: any[], resourceId: string): any[] =>
  list.filter((n) => n.resourceId === resourceId);

beforeAll(async () => {
  admin = await createUser('administrator');
  sup1 = await createUser('supervisor');
  sup2 = await createUser('supervisor');
  sup3 = await createUser('supervisor');
  st1 = await createUser('student');
  st2 = await createUser('student');
  st3 = await createUser('student');

  // §15.2 "Supervisor assigned" fires here — st1 ↔ sup1 (and is asserted).
  const assigned = await request(app)
    .post(`/api/v1/students/${st1.id}/supervisor`)
    .set(auth(admin))
    .send({ supervisorId: sup1.id });
  expect(assigned.status).toBe(201);
  assignmentId = d(assigned).assignment.id;

  // st3 ↔ sup3: the assignment the proposal-approval trigger needs.
  const assigned3 = await request(app)
    .post(`/api/v1/students/${st3.id}/supervisor`)
    .set(auth(admin))
    .send({ supervisorId: sup3.id });
  expect(assigned3.status).toBe(201);

  const project = await request(app)
    .post('/api/v1/projects')
    .set(auth(admin))
    .send({
      studentId: st1.id,
      title: 'Phase 7 — notifications',
      description: 'Integration fixture for the notifications module.',
    });
  expect(project.status).toBe(201);
  projectId = d(project).project.id;
});

afterAll(async () => {
  await db.$client.end();
});

/* ========================================================================= */

describe('recipient resolution per trigger (§15.2)', () => {
  it('Supervisor assigned → student + supervisor (two rows, one assignment)', async () => {
    const forStudent = withResource((await fetchNotifs(st1, '?limit=100')).list, assignmentId);
    expect(forStudent).toHaveLength(1);
    expect(forStudent[0]).toMatchObject({ type: 'assignment', readAt: null });

    const forSupervisor = withResource((await fetchNotifs(sup1, '?limit=100')).list, assignmentId);
    expect(forSupervisor).toHaveLength(1);
    expect(forSupervisor[0].message).toContain('assigned');
  });

  it('Supervisor changed → the student + the NEW supervisor only', async () => {
    // st2 is unassigned: assign sup2, then change to sup1 (§11.1 upsert/change).
    const first = await request(app)
      .post(`/api/v1/students/${st2.id}/supervisor`)
      .set(auth(admin))
      .send({ supervisorId: sup2.id });
    expect(first.status).toBe(201);
    const firstId = d(first).assignment.id;
    expect(withResource((await fetchNotifs(sup2, '?limit=100')).list, firstId)).toHaveLength(1);

    const changed = await request(app)
      .patch(`/api/v1/students/${st2.id}/supervisor`)
      .set(auth(admin))
      .send({ supervisorId: sup1.id });
    expect(changed.status).toBe(200);
    changedAssignmentId = d(changed).assignment.id;

    expect(withResource((await fetchNotifs(st2, '?limit=100')).list, changedAssignmentId)).toHaveLength(1);
    expect(withResource((await fetchNotifs(sup1, '?limit=100')).list, changedAssignmentId)).toHaveLength(1);
    // The outgoing supervisor is silent — §15.2 has no row for an ended
    // relationship (history preserves it, I12).
    expect(withResource((await fetchNotifs(sup2, '?limit=100')).list, changedAssignmentId)).toHaveLength(0);
  });

  it('Proposal submitted → the assigned supervisor', async () => {
    const created = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st3))
      .send({
        title: 'Notification fixture A',
        abstract: 'Submission trigger.',
        body: '<p>Full proposal text.</p>',
      });
    expect(created.status).toBe(201);
    proposalA = d(created).proposal.id;

    const submit = await request(app)
      .post(`/api/v1/proposals/${proposalA}/submit`)
      .set(auth(st3));
    expect(submit.status).toBe(201);

    const rows = withResource((await fetchNotifs(sup3, '?limit=100')).list, proposalA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'proposal', title: 'Proposal submitted' });
    // The author hears nothing yet (§15.2 rows one → assigned supervisor).
    expect(withResource((await fetchNotifs(st3, '?limit=100')).list, proposalA)).toHaveLength(0);
  });

  it('Proposal revision requested → the student', async () => {
    // Continues the SAME proposal (I4: one in-flight proposal per student).
    const started = await request(app)
      .post(`/api/v1/proposals/${proposalA}/start-review`)
      .set(auth(sup3));
    expect(started.status).toBe(200); // status transition, not a created row
    const review = await request(app)
      .post(`/api/v1/proposals/${proposalA}/review`)
      .set(auth(sup3))
      .send({ decision: 'revision_required', comment: 'Tighten the abstract.' });
    expect(review.status).toBe(200); // Phase 3: proposal review returns 200 {proposal, review, project}

    const rows = withResource((await fetchNotifs(st3, '?limit=100')).list, proposalA).filter(
      (n) => n.title === 'Revision requested',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'proposal', title: 'Revision requested' });
    expect(
      withResource((await fetchNotifs(sup3, '?limit=100')).list, proposalA).filter(
        (n) => n.title === 'Revision requested',
      ),
    ).toHaveLength(0); // the reviewer never hears their own decision
  });

  it('Proposal rejected → the student', async () => {
    // revision_required → submit is an allowed transition (§5.4), so the same
    // proposal carries the arc forward instead of spawning a second in-flight row.
    const resubmit = await request(app)
      .post(`/api/v1/proposals/${proposalA}/submit`)
      .set(auth(st3));
    expect(resubmit.status).toBe(201);
    await request(app).post(`/api/v1/proposals/${proposalA}/start-review`).set(auth(sup3));
    const review = await request(app)
      .post(`/api/v1/proposals/${proposalA}/review`)
      .set(auth(sup3))
      .send({ decision: 'rejected', comment: 'Out of scope.' });
    expect(review.status).toBe(200);

    const rows = withResource((await fetchNotifs(st3, '?limit=100')).list, proposalA).filter(
      (n) => n.title === 'Proposal rejected',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'proposal', title: 'Proposal rejected' });
  });

  it('Proposal approved + project created → student AND supervisor', async () => {
    // The previous proposal is terminal (rejected), so a fresh one may start.
    const created = await request(app)
      .post('/api/v1/proposals')
      .set(auth(st3))
      .send({
        title: 'Notification fixture D',
        abstract: 'Approval trigger.',
        body: '<p>Full proposal text.</p>',
      });
    expect(created.status).toBe(201);
    const proposalId = d(created).proposal.id;
    await request(app).post(`/api/v1/proposals/${proposalId}/submit`).set(auth(st3));
    await request(app)
      .post(`/api/v1/proposals/${proposalId}/start-review`)
      .set(auth(sup3));
    const review = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(sup3))
      .send({ decision: 'approved' });
    expect(review.status).toBe(200);
    const approvedProjectId = d(review).project.id;
    expect(approvedProjectId).toBeTruthy();

    for (const user of [st3, sup3]) {
      const rows = withResource((await fetchNotifs(user, '?limit=100')).list, approvedProjectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'proposal', title: 'Proposal approved' });
    }
  });

  it('Submission created → the assigned supervisor', async () => {
    const created = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .send({ projectId, title: 'Notification fixture submission', body: '<p>Content.</p>' });
    expect(created.status).toBe(201);
    submissionId = d(created).submission.id;

    const rows = withResource((await fetchNotifs(sup1, '?limit=100')).list, submissionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'submission', title: 'Submission created' });
    expect(withResource((await fetchNotifs(st1, '?limit=100')).list, submissionId)).toHaveLength(0);
  });

  it('Submission reviewed → the student (the author of the work)', async () => {
    const submit = await request(app)
      .post(`/api/v1/submissions/${submissionId}/submit`)
      .set(auth(st1));
    expect(submit.status).toBe(201);

    const review = await request(app)
      .post(`/api/v1/submissions/${submissionId}/reviews`)
      .set(auth(sup1))
      .send({ decision: 'revision_required', comment: 'Chapter needs sources.' });
    expect(review.status).toBe(201);

    const rows = withResource((await fetchNotifs(st1, '?limit=100')).list, submissionId);
    const reviewRows = rows.filter((r) => r.type === 'review');
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0].message).toContain('revision required');
    // The reviewer hears nothing about their own decision.
    expect(
      withResource((await fetchNotifs(sup1, '?limit=100')).list, submissionId).filter(
        (r) => r.type === 'review',
      ),
    ).toHaveLength(0);
  });

  it('Milestone completed (changeStatus path) → student + supervisor', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Notification fixture milestone', dueAt: farFuture(10) });
    expect(created.status).toBe(201);
    const milestoneId = d(created).milestone.id;

    const moved = await request(app)
      .post(`/api/v1/milestones/${milestoneId}/status`)
      .set(auth(sup1))
      .send({ status: 'approved' });
    expect(moved.status).toBe(200);

    for (const user of [st1, sup1]) {
      const rows = withResource((await fetchNotifs(user, '?limit=100')).list, milestoneId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'milestone', title: 'Milestone completed' });
    }
  });

  it('Milestone completed (§5.5 review side effect) → student + supervisor', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Review-completed milestone', dueAt: farFuture(12) });
    const milestoneId = d(created).milestone.id;

    const submission = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .send({
        projectId,
        milestoneId,
        title: 'Tied submission',
        body: '<p>Work for the milestone.</p>',
      });
    const submissionId = d(submission).submission.id;
    await request(app).post(`/api/v1/submissions/${submissionId}/submit`).set(auth(st1));
    const review = await request(app)
      .post(`/api/v1/submissions/${submissionId}/reviews`)
      .set(auth(sup1))
      .send({ decision: 'approved', comment: 'Done.' });
    expect(review.status).toBe(201);

    for (const user of [st1, sup1]) {
      const rows = withResource((await fetchNotifs(user, '?limit=100')).list, milestoneId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'milestone', title: 'Milestone completed' });
    }
    const [stored] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
    expect(stored.status).toBe('approved');
  });

  it('New feedback → the author’s counterparties, never the author, never bystanders', async () => {
    // Notifications point at the thread's project/submission (there is no
    // /feedback/:id route to link to), so the assertion is a per-user count.
    const feedbackCount = async (user: TestUser): Promise<number> =>
      (await fetchNotifs(user, '?limit=100')).list.filter((n) => n.type === 'feedback').length;

    const st0 = await feedbackCount(st1);
    const sp0 = await feedbackCount(sup1);
    const ad0 = await feedbackCount(admin);

    // Student authors → the supervisor alone.
    const byStudent = await request(app)
      .post(`/api/v1/projects/${projectId}/feedback`)
      .set(auth(st1))
      .send({ body: '<p>When is the review?</p>' });
    expect(byStudent.status).toBe(201);
    expect(await feedbackCount(sup1)).toBe(sp0 + 1);
    expect(await feedbackCount(st1)).toBe(st0); // author excluded
    expect(await feedbackCount(admin)).toBe(ad0); // overseer hears nothing
    expect(await feedbackCount(sup2)).toBe(0); // bystander with no role here

    // Supervisor authors → the student alone.
    const bySupervisor = await request(app)
      .post(`/api/v1/projects/${projectId}/feedback`)
      .set(auth(sup1))
      .send({ body: '<p>Thursday, lab 3.</p>' });
    expect(bySupervisor.status).toBe(201);
    expect(await feedbackCount(st1)).toBe(st0 + 1);
    expect(await feedbackCount(sup1)).toBe(sp0 + 1); // author excluded

    // Administrator authors → the whole student/supervisor pair.
    const byAdmin = await request(app)
      .post(`/api/v1/projects/${projectId}/feedback`)
      .set(auth(admin))
      .send({ body: '<p>Please keep the timeline.</p>' });
    expect(byAdmin.status).toBe(201);
    expect(await feedbackCount(st1)).toBe(st0 + 2);
    expect(await feedbackCount(sup1)).toBe(sp0 + 2);
    expect(await feedbackCount(admin)).toBe(ad0); // their own row reaches nobody who wrote it
  });

  it('every row in a feed is the requesting user’s own — exact set match', async () => {
    for (const user of [st1, sup1, sup3, admin]) {
      const { list } = await fetchNotifs(user, '?limit=100');
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id));
      expect(list.map((n) => n.id).sort()).toEqual(rows.map((r) => r.id).sort());
    }
    // Admin is never a counterparty of a trigger — an empty bell is correct,
    // and the equality above already proves nothing foreign leaked in.
    expect((await fetchNotifs(admin, '?limit=100')).list).toHaveLength(0);
  });
});

/* ========================================================================= */

describe('unread count and filters (§11.8)', () => {
  it('unread-count agrees with ?unread=true, and both step down after mark-read', async () => {
    const before = await unread(st1);
    expect(before).toBeGreaterThan(0);

    const unreadList = await fetchNotifs(st1, '?unread=true&limit=100');
    expect(unreadList.total).toBe(before);
    expect(unreadList.list).toHaveLength(before);
    expect(unreadList.list.every((n: any) => n.readAt === null)).toBe(true);

    const target = unreadList.list[0];
    const read = await request(app)
      .post(`/api/v1/notifications/${target.id}/read`)
      .set(auth(st1));
    expect(read.status).toBe(200);
    expect(d(read).notification.readAt).not.toBeNull();
    expect(d(read).notification.id).toBe(target.id);

    expect(await unread(st1)).toBe(before - 1);
    // Re-reading keeps the original timestamp (idempotent).
    const again = await request(app)
      .post(`/api/v1/notifications/${target.id}/read`)
      .set(auth(st1));
    expect(again.status).toBe(200);
    expect(new Date(d(again).notification.readAt).getTime()).toBe(
      new Date(d(read).notification.readAt).getTime(),
    );
    expect(await unread(st1)).toBe(before - 1);
  });

  it('read-all flips only this user’s unread rows', async () => {
    const supBefore = await unread(sup1);
    expect(supBefore).toBeGreaterThan(0);

    const res = await request(app).post('/api/v1/notifications/read-all').set(auth(st1));
    expect(res.status).toBe(200);
    expect(d(res).updated).toBeGreaterThanOrEqual(1);
    expect(await unread(st1)).toBe(0);

    // Another user's bell is untouched.
    expect(await unread(sup1)).toBe(supBefore);
  });

  it('paginates: page/limit shape and a shrinking page', async () => {
    const first = await fetchNotifs(sup1, '?page=1&limit=2');
    expect(first.list).toHaveLength(2);
    expect(first.page).toBe(1);
    expect(first.limit).toBe(2);
    expect(first.total).toBeGreaterThanOrEqual(2);

    const second = await fetchNotifs(sup1, '?page=2&limit=2');
    expect(second.page).toBe(2);
    const overlap = second.list.filter((n: any) => first.list.some((m: any) => m.id === n.id));
    expect(overlap).toHaveLength(0); // stable ordering across pages
  });
});

/* ========================================================================= */

describe('scoping: own rows only, another user’s row is 404 (§11.8, §13.5)', () => {
  it('mark-read refuses a foreign row with 404 — not 403', async () => {
    const supRows = (await fetchNotifs(sup1, '?limit=100')).list;
    expect(supRows.length).toBeGreaterThan(0);
    const foreign = supRows[0];

    const res = await request(app)
      .post(`/api/v1/notifications/${foreign.id}/read`)
      .set(auth(st1));
    expect(res.status).toBe(404);
    expect(e(res)).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    // The row itself is untouched — existence is masked, not corrupted.
    const [stored] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, foreign.id));
    expect(stored).toBeDefined();
    expect(stored.readAt).toBeNull(); // the 404 neither marked it read nor deleted it
    expect(await unread(sup1)).toBe(supRows.filter((n) => n.readAt === null).length);
  });

  it('unknown id → 404, malformed id → 400 (§13.5 order)', async () => {
    const unknown = await request(app)
      .post(`/api/v1/notifications/${randomUUID()}/read`)
      .set(auth(st1));
    expect(unknown.status).toBe(404);

    const malformed = await request(app)
      .post('/api/v1/notifications/not-a-uuid/read')
      .set(auth(st1));
    expect(malformed.status).toBe(400);
    expect(e(malformed)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('the feed never leaks: st2’s rows are absent from st1’s feed', async () => {
    const st2Rows = (await fetchNotifs(st2, '?limit=100')).list;
    expect(st2Rows.length).toBeGreaterThan(0);
    const st1Feed = (await fetchNotifs(st1, '?limit=100')).list;
    const st1Ids = new Set(st1Feed.map((n: any) => n.id));
    expect(st2Rows.some((n) => st1Ids.has(n.id))).toBe(false);
  });
});

/* ========================================================================= */

describe('deadline materialisation on read (§15.2, task 7.4)', () => {
  it('a milestone due within 72h materialises exactly one row per reader — ever', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Due tomorrow', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(created.status).toBe(201);
    const milestoneId = d(created).milestone.id;

    const first = await fetchNotifs(st1, '?limit=100');
    expect(withResource(first.list, milestoneId).filter((n) => n.type === 'deadline')).toHaveLength(1);

    // Poll again — the bell must not refill (one row per user+window).
    const second = await fetchNotifs(st1, '?limit=100');
    expect(withResource(second.list, milestoneId)).toHaveLength(1);

    // The assigned supervisor's bell materialises their own row …
    const supervisorSide = await fetchNotifs(sup1, '?limit=100');
    expect(withResource(supervisorSide.list, milestoneId).filter((n) => n.type === 'deadline')).toHaveLength(1);

    // … while an administrator who is neither party gets nothing.
    expect(withResource((await fetchNotifs(admin, '?limit=100')).list, milestoneId)).toHaveLength(0);

    const [stored] = await db.select().from(notifications).where(eq(notifications.userId, st1.id));
    expect(stored).toBeDefined(); // sanity: rows exist for this user at all
  });

  it('polling unread-count materialises too — both endpoints share one window', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Due in two days', dueAt: new Date(Date.now() + 172_800_000).toISOString() });
    const milestoneId = d(created).milestone.id;

    await unread(st1); // the badge poll does the materialise
    const feed = await fetchNotifs(st1, '?limit=100');
    expect(withResource(feed.list, milestoneId)).toHaveLength(1);

    await fetchNotifs(st1, '?limit=100'); // and the feed poll changes nothing
    await unread(st1);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, st1.id));
    expect(rows.filter((r) => r.resourceId === milestoneId && r.type === 'deadline')).toHaveLength(1);
  });

  it('never materialises for far-future or approved milestones', async () => {
    const far = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Due in ten days', dueAt: farFuture(10) });
    const farId = d(far).milestone.id;

    const dueSoon = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Due soon but approved', dueAt: new Date(Date.now() + 90_000_000).toISOString() });
    const dueSoonId = d(dueSoon).milestone.id;
    const approved = await request(app)
      .post(`/api/v1/milestones/${dueSoonId}/status`)
      .set(auth(sup1))
      .send({ status: 'approved' });
    expect(approved.status).toBe(200);

    const feed = await fetchNotifs(st1, '?limit=100');
    expect(withResource(feed.list, farId)).toHaveLength(0);
    expect(withResource(feed.list, dueSoonId).filter((n) => n.type === 'deadline')).toHaveLength(0);
  });

  it('a stale warning never refills the bell, but a NEW due window warns again', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(sup1))
      .send({ title: 'Reschedule me', dueAt: new Date(Date.now() + 36_000_000).toISOString() });
    expect(created.status).toBe(201);
    const milestoneId = d(created).milestone.id;

    // Approaching → exactly one warning.
    expect(withResource((await fetchNotifs(st1, '?limit=100')).list, milestoneId)).toHaveLength(1);

    // Pushed beyond 72 h: it stops being a candidate — no new row, and the
    // old one is history, not deleted.
    const pushed = await request(app)
      .patch(`/api/v1/milestones/${milestoneId}`)
      .set(auth(sup1))
      .send({ dueAt: farFuture(20) });
    expect(pushed.status).toBe(200);
    expect(withResource((await fetchNotifs(st1, '?limit=100')).list, milestoneId)).toHaveLength(1);

    // Age the existing row to stand in for the time that really passes while
    // a due date sits beyond the window: `createdAt` is then older than the
    // milestone's CURRENT window (`due_at − 72h`), which is exactly the rule
    // in task 7.4 — one row per (user, milestone, due window).
    await db
      .update(notifications)
      .set({ createdAt: new Date(Date.now() - 5 * 86_400_000) })
      .where(
        and(
          eq(notifications.userId, st1.id),
          eq(notifications.resourceId, milestoneId),
          eq(notifications.type, 'deadline'),
        ),
      );

    // Pulled back inside the window → the current window has no row → one more.
    const pulled = await request(app)
      .patch(`/api/v1/milestones/${milestoneId}`)
      .set(auth(sup1))
      .send({ dueAt: new Date(Date.now() + 54_000_000).toISOString() });
    expect(pulled.status).toBe(200);

    expect(withResource((await fetchNotifs(st1, '?limit=100')).list, milestoneId)).toHaveLength(2);

    // …and it stays at two under further polls: the fresh row IS inside the
    // current window.
    await fetchNotifs(st1, '?limit=100');
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, st1.id),
          eq(notifications.resourceId, milestoneId),
          eq(notifications.type, 'deadline'),
        ),
      );
    expect(rows).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------- helpers */

/** ISO due dates at `days` days out — far outside the 72 h window. */
function farFuture(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
