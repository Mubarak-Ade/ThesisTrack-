import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { projects, supervisorAssignments, users } from '../../src/schema/index.js';

/**
 * Phase 4 integration suite — milestones module (spec §5.6, §8.5, §11.4).
 *
 * Covers task 4.11's milestone half: creation RBAC, the §11.4 per-role status
 * matrix driven over HTTP (student chain vs supervisor/admin "any"), overdue as
 * a COMPUTED read, reorder exact-set semantics, template materialisation with
 * §8.5's exact-millisecond offsets, and template CRUD RBAC.
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

interface TestProject {
  id: string;
  studentId: string;
  createdAt: Date;
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

/** Direct row creation — projects exist only as guard subjects in this suite. */
async function createProject(student: TestUser, title: string): Promise<TestProject> {
  const [row] = await db
    .insert(projects)
    .values({
      studentId: student.id,
      title,
      description: 'Phase 4 milestone fixture',
      status: 'active',
    })
    .returning();
  return { id: row.id, studentId: row.studentId, createdAt: row.createdAt };
}

/** Project-keyed active assignment (§13.3) — grants the supervisor access. */
async function assign(supervisor: TestUser, student: TestUser, projectId: string): Promise<void> {
  await db.insert(supervisorAssignments).values({
    studentId: student.id,
    supervisorId: supervisor.id,
    isPrimary: true,
    assignedBy: admin.id,
    projectId,
  });
}

let admin: TestUser;
let sup1: TestUser; // assigned to st1's project
let sup2: TestUser; // assigned to nobody
let st1: TestUser;
let st2: TestUser;
let st3: TestUser;

let p1: TestProject; // st1 + sup1 — RBAC/status/overdue home
let p2: TestProject; // st2 — reorder
let p3: TestProject; // st3 — from-template

beforeAll(async () => {
  admin = await createUser('administrator');
  sup1 = await createUser('supervisor');
  sup2 = await createUser('supervisor');
  [st1, st2, st3] = await Promise.all(
    Array.from({ length: 3 }, () => createUser('student')),
  );

  p1 = await createProject(st1, 'Milestones: RBAC and status');
  await assign(sup1, st1, p1.id);
  p2 = await createProject(st2, 'Milestones: reorder');
  p3 = await createProject(st3, 'Milestones: from-template');
});

afterAll(async () => {
  await db.$client.end();
});

/** Create a milestone over HTTP and return its row. */
async function createMilestone(
  project: TestProject,
  actor: TestUser,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app).post(`/api/v1/projects/${project.id}/milestones`).set(auth(actor)).send(body);
}

const listMilestones = (project: TestProject, actor: TestUser) =>
  request(app).get(`/api/v1/projects/${project.id}/milestones`).set(auth(actor));

/* ========================================================================= */

describe('milestone creation RBAC and ordering (§11.4)', () => {
  it('refuses the student with 403 — students do not author milestones', async () => {
    const res = await createMilestone(p1, st1, { title: 'Student-authored' });
    expect(res.status).toBe(403);
    expect(e(res).code).toBe('AUTHORIZATION_ERROR');
  });

  it('refuses an unassigned supervisor with 403 (§13.3 projectId key)', async () => {
    const res = await createMilestone(p1, sup2, { title: 'Stranger-authored' });
    expect(res.status).toBe(403);
    expect(e(res).code).toBe('AUTHORIZATION_ERROR');
  });

  it('refuses an anonymous request with 401', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${p1.id}/milestones`)
      .send({ title: 'Nobody' });
    expect(res.status).toBe(401);
  });

  it('lets the assigned supervisor create at position 0', async () => {
    const res = await createMilestone(p1, sup1, {
      title: 'Proposal defence',
      description: 'First milestone of the run',
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(res.status).toBe(201);
    expect(d(res).milestone).toMatchObject({
      projectId: p1.id,
      title: 'Proposal defence',
      status: 'pending',
      position: 0,
      completedAt: null,
      overdue: false,
      state: 'pending',
    });
  });

  it('lets an administrator append at position 1', async () => {
    const res = await createMilestone(p1, admin, { title: 'Midterm review' });
    expect(res.status).toBe(201);
    expect(d(res).milestone).toMatchObject({ position: 1, status: 'pending' });
  });

  it('lists both in position order with computed fields (§5.6)', async () => {
    const res = await listMilestones(p1, sup1);
    expect(res.status).toBe(200);
    expect(d(res).milestones.map((m: any) => m.position)).toEqual([0, 1]);
    expect(d(res).milestones.map((m: any) => m.title)).toEqual([
      'Proposal defence',
      'Midterm review',
    ]);
    for (const row of d(res).milestones) {
      expect(row).toHaveProperty('overdue');
      expect(row.state).toBe(row.status); // not overdue ⇒ state mirrors status
    }
  });

  it('403s the list for an unassigned supervisor and a stranger', async () => {
    expect((await listMilestones(p1, sup2)).status).toBe(403);
    expect((await listMilestones(p1, st2)).status).toBe(403);
    expect((await listMilestones(p1, st1)).status).toBe(200); // the owner reads
  });
});

/* ========================================================================= */

describe('status matrix over HTTP (§11.4)', () => {
  let target = '';

  beforeAll(async () => {
    const res = await createMilestone(p1, admin, { title: 'Status matrix target' });
    expect(res.status).toBe(201);
    target = d(res).milestone.id;
  });

  const setStatus = (actor: TestUser, status: string) =>
    request(app)
      .post(`/api/v1/milestones/${target}/status`)
      .set(auth(actor))
      .send({ status });

  it('a student may take pending → in_progress', async () => {
    const res = await setStatus(st1, 'in_progress');
    expect(res.status).toBe(200);
    expect(d(res).milestone).toMatchObject({ status: 'in_progress', state: 'in_progress' });
  });

  it('a student may NOT take a non-adjacent step (pending → submitted)', async () => {
    // A dedicated milestone still sitting at `pending`: the chain only allows
    // adjacent steps, so the student may not jump the middle one.
    const fresh = await createMilestone(p1, admin, { title: 'Chain skip target' });
    expect(fresh.status).toBe(201);
    const skipId = d(fresh).milestone.id;

    const res = await request(app)
      .post(`/api/v1/milestones/${skipId}/status`)
      .set(auth(st1))
      .send({ status: 'submitted' });
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details?.[0]?.path).toBe('status');
    expect(e(res).details?.[0]?.message).toBe(
      'Students may move a milestone along pending → in_progress → submitted only',
    );

    // …and the row did not move.
    const list = await listMilestones(p1, admin);
    const row = d(list).milestones.find((m: any) => m.id === skipId);
    expect(row.status).toBe('pending');
  });

  it('a student may take in_progress → submitted', async () => {
    const res = await setStatus(st1, 'submitted');
    expect(res.status).toBe(200);
    expect(d(res).milestone.status).toBe('submitted');
  });

  it('a student may NEVER reach approved — exact §11.4 message', async () => {
    const res = await setStatus(st1, 'approved');
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
      message: "Cannot move milestone to 'approved'",
    });
    expect(e(res).details).toEqual([
      {
        path: 'status',
        message: 'Students may move a milestone along pending → in_progress → submitted only',
      },
    ]);
  });

  it('same-status is a 422 naming the current status', async () => {
    const res = await setStatus(sup1, 'submitted');
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({
      message: 'Milestone is already submitted',
      details: [{ path: 'status', message: 'Milestone is already submitted' }],
    });
  });

  it('an unknown status value is a 400 (schema enum), not a 422', async () => {
    const res = await setStatus(admin, 'overdue');
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });

  it('a stranger and an anonymous caller cannot touch the status', async () => {
    expect((await setStatus(st2, 'approved')).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/milestones/${target}/status`)
          .send({ status: 'approved' })
      ).status,
    ).toBe(401);
  });

  it('a supervisor may approve, stamping completed_at', async () => {
    const res = await setStatus(sup1, 'approved');
    expect(res.status).toBe(200);
    expect(d(res).milestone).toMatchObject({ status: 'approved', state: 'approved' });
    expect(d(res).milestone.completedAt).toBeTruthy();
  });

  it('leaving approved CLEARS completed_at (the column means "was approved")', async () => {
    const res = await setStatus(admin, 'pending');
    expect(res.status).toBe(200);
    expect(d(res).milestone).toMatchObject({ status: 'pending', completedAt: null });
  });

  it('an administrator may set any target from any state', async () => {
    const res = await setStatus(admin, 'approved');
    expect(res.status).toBe(200);
    expect(d(res).milestone.status).toBe('approved');
    expect(d(res).milestone.completedAt).toBeTruthy();
  });
});

/* ========================================================================= */

describe('overdue is computed at read, never stored (§5.6)', () => {
  let overdueId = '';

  it('a past-dueAt pending milestone reads overdue:true, state:overdue', async () => {
    const res = await createMilestone(p1, admin, {
      title: 'Long overdue fixture',
      dueAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(res.status).toBe(201);
    overdueId = d(res).milestone.id;
    expect(d(res).milestone).toMatchObject({ overdue: true, state: 'overdue' });

    const list = await listMilestones(p1, admin);
    const row = d(list).milestones.find((m: any) => m.id === overdueId);
    expect(row).toMatchObject({ overdue: true, state: 'overdue', status: 'pending' });
  });

  it('approving it flips the READ (no write to an overdue column)', async () => {
    const approve = await request(app)
      .post(`/api/v1/milestones/${overdueId}/status`)
      .set(auth(admin))
      .send({ status: 'approved' });
    expect(approve.status).toBe(200);

    const list = await listMilestones(p1, admin);
    const row = d(list).milestones.find((m: any) => m.id === overdueId);
    expect(row).toMatchObject({ overdue: false, state: 'approved', status: 'approved' });
  });

  it('a future dueAt milestone is never overdue, even while pending', async () => {
    const res = await createMilestone(p1, admin, {
      title: 'Future fixture',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(res.status).toBe(201);
    expect(d(res).milestone).toMatchObject({ overdue: false, state: 'pending' });
  });

  it('null dueAt is never overdue', async () => {
    const res = await createMilestone(p1, admin, { title: 'No deadline fixture' });
    expect(res.status).toBe(201);
    expect(d(res).milestone).toMatchObject({ dueAt: null, overdue: false });
  });
});

/* ========================================================================= */

describe('reorder: exact set, contiguous 0-based positions (§11.4)', () => {
  const created: string[] = [];

  beforeAll(async () => {
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      const res = await createMilestone(p2, admin, { title });
      expect(res.status).toBe(201);
      created.push(d(res).milestone.id);
    }
  });

  const reorder = (actor: TestUser, order: string[]) =>
    request(app)
      .put(`/api/v1/projects/${p2.id}/milestones/reorder`)
      .set(auth(actor))
      .send({ order });

  it('refuses the student with 403 (requireRole layer)', async () => {
    const res = await reorder(st2, [...created].reverse());
    expect(res.status).toBe(403);
    expect(e(res).code).toBe('AUTHORIZATION_ERROR');
  });

  it('reverses the order and renumbers positions contiguously from 0', async () => {
    const reversed = [...created].reverse();
    const res = await reorder(admin, reversed);
    expect(res.status).toBe(200);
    const rows = d(res).milestones;
    expect(rows.map((m: any) => m.id)).toEqual(reversed);
    expect(rows.map((m: any) => m.position)).toEqual([0, 1, 2]);
  });

  it('rejects a partial order with 422 on path `order`', async () => {
    const res = await reorder(admin, created.slice(0, 2));
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details?.[0]?.path).toBe('order');
    expect(e(res).details?.[0]?.message).toContain('exactly once');
  });

  it('rejects duplicate ids with 422 on path `order`', async () => {
    const res = await reorder(admin, [created[0], created[0], created[2]]);
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('order');
  });

  it('rejects an id belonging to ANOTHER project (cross-project write)', async () => {
    const foreign = (
      await listMilestones(p1, admin)
    ).body.data.milestones.map((m: any) => m.id);
    const res = await reorder(admin, [...created.slice(0, 2), foreign[0]]);
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('order');
  });

  it('leaves positions untouched after every rejection', async () => {
    const list = await listMilestones(p2, admin);
    expect(d(list).milestones.map((m: any) => m.position)).toEqual([0, 1, 2]);
  });
});

/* ========================================================================= */

describe('template CRUD + from-template materialisation (§8.5, §11.4)', () => {
  let templateId = '';
  let emptyTemplateId = '';

  it('refuses template reads from a student (403) and anonymous (401)', async () => {
    expect((await request(app).get('/api/v1/milestone-templates').set(auth(st1))).status).toBe(403);
    expect((await request(app).get('/api/v1/milestone-templates')).status).toBe(401);
  });

  it('lets a supervisor read the template list', async () => {
    const res = await request(app).get('/api/v1/milestone-templates').set(auth(sup1));
    expect(res.status).toBe(200);
    expect(Array.isArray(d(res).templates)).toBe(true);
  });

  it('refuses template creation from a supervisor (403 — Coordinator defines)', async () => {
    const res = await request(app)
      .post('/api/v1/milestone-templates')
      .set(auth(sup1))
      .send({ name: `Nope ${randomUUID().slice(0, 8)}`, items: [] });
    expect(res.status).toBe(403);
  });

  it('creates a template as an administrator, and a duplicate NAME is legal (201)', async () => {
    const stamp = randomUUID().slice(0, 8);
    const payload = {
      name: `Phase 4 template ${stamp}`,
      description: 'Offsets anchored to project creation',
      items: [
        { title: 'Literature review', dueOffsetDays: 7 },
        { title: 'Ethics clearance', description: 'Board form', dueOffsetDays: 21 },
      ],
    };

    const first = await request(app)
      .post('/api/v1/milestone-templates')
      .set(auth(admin))
      .send(payload);
    expect(first.status).toBe(201);
    templateId = d(first).template.id;
    expect(d(first).template.items).toHaveLength(2);

    // §8.5: no uniqueness on name — duplicates are legal data, never a 409.
    const second = await request(app)
      .post('/api/v1/milestone-templates')
      .set(auth(admin))
      .send(payload);
    expect(second.status).toBe(201);
    expect(d(second).template.id).not.toBe(templateId);
  });

  it('creates an empty-items template (items default to empty, §8.5)', async () => {
    const res = await request(app)
      .post('/api/v1/milestone-templates')
      .set(auth(admin))
      .send({ name: `Empty ${randomUUID().slice(0, 8)}` });
    expect(res.status).toBe(201);
    expect(d(res).template.items).toEqual([]);
    emptyTemplateId = d(res).template.id;
  });

  it('refuses an empty PATCH with 400 (at least one field)', async () => {
    const res = await request(app)
      .patch(`/api/v1/milestone-templates/${templateId}`)
      .set(auth(admin))
      .send({});
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });

  it('replaces the whole item set on PATCH (ADR-05 whole edit)', async () => {
    const res = await request(app)
      .patch(`/api/v1/milestone-templates/${templateId}`)
      .set(auth(admin))
      .send({ items: [{ title: 'Only item now', dueOffsetDays: 3 }] });
    expect(res.status).toBe(200);
    expect(d(res).template.items).toEqual([
      { title: 'Only item now', description: null, dueOffsetDays: 3 },
    ]);

    // …and the read sees it whole
    const list = await request(app).get('/api/v1/milestone-templates').set(auth(sup1));
    const found = d(list).templates.find((t: any) => t.id === templateId);
    expect(found.items).toHaveLength(1);
  });

  it('appends a template to a project at exact §8.5 offsets from created_at', async () => {
    // p3 starts empty — seed one milestone so the template must APPEND.
    const seed = await createMilestone(p3, admin, { title: 'Pre-existing' });
    expect(seed.status).toBe(201);
    expect(d(seed).milestone.position).toBe(0);

    const res = await request(app)
      .post(`/api/v1/projects/${p3.id}/milestones/from-template`)
      .set(auth(admin))
      .send({ templateId });
    expect(res.status).toBe(201);

    const rows = d(res).milestones;
    expect(rows).toHaveLength(1); // PATCH reduced the set to a single item
    expect(rows[0].position).toBe(1); // appended after the existing max
    expect(rows[0].title).toBe('Only item now');
    expect(new Date(rows[0].dueAt).getTime()).toBe(
      p3.createdAt.getTime() + 3 * 86_400_000,
    );
  });

  it('rejects an unknown body templateId with 400 on path `templateId`', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${p3.id}/milestones/from-template`)
      .set(auth(admin))
      .send({ templateId: randomUUID() });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details).toEqual([
      { path: 'templateId', message: 'Milestone template not found' },
    ]);
  });

  it('materialises ZERO milestones for an empty template (never a failure)', async () => {
    const before = await listMilestones(p3, admin);
    const res = await request(app)
      .post(`/api/v1/projects/${p3.id}/milestones/from-template`)
      .set(auth(admin))
      .send({ templateId: emptyTemplateId });
    expect(res.status).toBe(201);
    expect(d(res).milestones).toEqual([]);

    const after = await listMilestones(p3, admin);
    expect(d(after).milestones).toHaveLength(d(before).milestones.length);
  });

  it('refuses from-template for a supervisor (403 — administrator only)', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${p3.id}/milestones/from-template`)
      .set(auth(sup1))
      .send({ templateId });
    expect(res.status).toBe(403);
  });

  it('deletes a template (200) and answers 404 for it afterwards', async () => {
    const del = await request(app)
      .delete(`/api/v1/milestone-templates/${templateId}`)
      .set(auth(admin));
    expect(del.status).toBe(200);
    expect(d(del).template.id).toBe(templateId);

    const again = await request(app)
      .patch(`/api/v1/milestone-templates/${templateId}`)
      .set(auth(admin))
      .send({ name: 'Ghost' });
    expect(again.status).toBe(404);
    expect(e(again).code).toBe('RESOURCE_NOT_FOUND');

    // Materialised milestones survive their template (§11.4).
    const list = await listMilestones(p3, admin);
    expect(d(list).milestones.some((m: any) => m.title === 'Only item now')).toBe(true);
  });
});
