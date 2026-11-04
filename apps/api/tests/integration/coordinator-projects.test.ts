import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { inArray, like, or } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import {
  departments,
  projects,
  proposals,
  supervisorAssignments,
  users,
  workflowStages,
  workflows,
} from '../../src/schema/index.js';

/**
 * Coordinator projects, proposals and read-only oversight — design
 * 2026-11-02 (ADR-17).
 *
 * A coordinator may create/patch projects for its department's students and
 * start/review their proposals (approval runs the unchanged §5.4 transaction).
 * Everything else in the academic modules is read-only oversight: reads inside
 * the department succeed, cross-department ids are 404, and every write keeps
 * answering 403.
 */

interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

const stamp = randomUUID().slice(0, 8);
const emailPrefix = `coord-projects-${stamp}`;

const d = (res: request.Response): any => res.body.data;
const auth = (user: TestUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.token}`,
});

function tokenFor(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function codeFor(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const raw = randomUUID().replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 4; i += 1) code += letters[parseInt(raw[i] ?? '0', 16) % letters.length];
  return code;
}

async function makeDepartment(): Promise<{ id: string; name: string; code: string }> {
  const code = codeFor();
  const [row] = await db
    .insert(departments)
    .values({ name: `Coord Projects ${code} ${stamp}`, code })
    .returning();
  return { id: row.id, name: row.name, code: row.code! };
}

async function insertUser(role: Role, departmentId: string | null): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `${emailPrefix}-${id.slice(0, 8)}@test.local`,
      firstName: 'Coord',
      lastName: id.slice(0, 8),
      role,
      departmentId,
      isActive: true,
      passwordHash: 'hash',
    })
    .returning();
  return { id: row.id, email: row.email, role, token: tokenFor(row) };
}

let departmentA: { id: string; name: string; code: string };
let departmentB: { id: string; name: string; code: string };
let admin: TestUser;
let coordinatorA: TestUser;
let studentA: TestUser;
let studentA2: TestUser;
let studentA3: TestUser;
let studentA4: TestUser;
let studentB: TestUser;
let supervisorA: TestUser;
let supervisorA2: TestUser;
let supervisorB: TestUser;
let workflowA: string;
let workflowB: string;
let projectA: string;
let projectB: string;
let proposalSubmittedA: string;
let proposalUnderReviewA2: string;
let proposalSubmittedB: string;
const createdProjectIds: string[] = [];

beforeAll(async () => {
  departmentA = await makeDepartment();
  departmentB = await makeDepartment();

  admin = await insertUser('administrator', null);
  coordinatorA = await insertUser('coordinator', departmentA.id);
  studentA = await insertUser('student', departmentA.id);
  studentA2 = await insertUser('student', departmentA.id);
  studentA3 = await insertUser('student', departmentA.id);
  studentA4 = await insertUser('student', departmentA.id);
  studentB = await insertUser('student', departmentB.id);
  supervisorA = await insertUser('supervisor', departmentA.id);
  supervisorA2 = await insertUser('supervisor', departmentA.id);
  supervisorB = await insertUser('supervisor', departmentB.id);

  const [wa] = await db
    .insert(workflows)
    .values({ name: `Workflow A ${stamp}`, departmentId: departmentA.id, createdBy: admin.id })
    .returning();
  const [wb] = await db
    .insert(workflows)
    .values({ name: `Workflow B ${stamp}`, departmentId: departmentB.id, createdBy: admin.id })
    .returning();
  workflowA = wa.id;
  workflowB = wb.id;

  await db.insert(workflowStages).values([
    { workflowId: workflowA, position: 1, name: 'Proposal' },
    { workflowId: workflowB, position: 1, name: 'Proposal' },
  ]);

  const [pa] = await db
    .insert(projects)
    .values({
      studentId: studentA.id,
      title: `Project A ${stamp}`,
      description: 'A',
      workflowId: workflowA,
    })
    .returning();
  const [pb] = await db
    .insert(projects)
    .values({
      studentId: studentB.id,
      title: `Project B ${stamp}`,
      description: 'B',
      workflowId: workflowB,
    })
    .returning();
  projectA = pa.id;
  projectB = pb.id;

  const [propA] = await db
    .insert(proposals)
    .values({
      studentId: studentA.id,
      title: `Proposal A ${stamp}`,
      abstract: 'Submitted proposal in department A',
      status: 'submitted',
      submittedAt: new Date(),
    })
    .returning();
  const [propA2] = await db
    .insert(proposals)
    .values({
      studentId: studentA3.id,
      title: `Proposal A2 ${stamp}`,
      abstract: 'Proposal awaiting a decision in department A',
      status: 'under_review',
      submittedAt: new Date(),
    })
    .returning();
  const [propB] = await db
    .insert(proposals)
    .values({
      studentId: studentB.id,
      title: `Proposal B ${stamp}`,
      abstract: 'Proposal in department B',
      status: 'submitted',
      submittedAt: new Date(),
    })
    .returning();
  proposalSubmittedA = propA.id;
  proposalUnderReviewA2 = propA2.id;
  proposalSubmittedB = propB.id;
});

afterAll(async () => {
  const projectIds = [projectA, projectB, ...createdProjectIds];
  await db.delete(proposals).where(inArray(proposals.id, [proposalSubmittedA, proposalUnderReviewA2, proposalSubmittedB]));
  await db.delete(proposals).where(
    inArray(proposals.studentId, [studentA.id, studentA2.id, studentA3.id, studentA4.id, studentB.id]),
  );
  await db.delete(supervisorAssignments).where(
    or(
      inArray(supervisorAssignments.studentId, [
        studentA.id,
        studentA2.id,
        studentA3.id,
        studentA4.id,
        studentB.id,
      ]),
      inArray(supervisorAssignments.supervisorId, [
        supervisorA.id,
        supervisorA2.id,
        supervisorB.id,
      ]),
    ),
  );
  await db.delete(projects).where(inArray(projects.id, projectIds));
  await db.delete(projects).where(
    inArray(projects.studentId, [studentA.id, studentA2.id, studentA3.id, studentA4.id, studentB.id]),
  );
  await db.delete(workflowStages).where(inArray(workflowStages.workflowId, [workflowA, workflowB]));
  await db.delete(workflows).where(inArray(workflows.id, [workflowA, workflowB]));
  await db.delete(users).where(like(users.email, `${emailPrefix}%`));
  await db.delete(departments).where(inArray(departments.id, [departmentA.id, departmentB.id]));
});

describe('projects — scope and writes', () => {
  it('lists only own-department projects', async () => {
    const res = await request(app)
      .get('/api/v1/projects')
      .query({ q: stamp, limit: 100 })
      .set(auth(coordinatorA));

    expect(res.status).toBe(200);
    const rows = d(res).projects as Array<{ id: string }>;
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(projectA);
    expect(ids).not.toContain(projectB);
  });

  it('reads and patches an in-department project', async () => {
    const show = await request(app).get(`/api/v1/projects/${projectA}`).set(auth(coordinatorA));
    expect(show.status).toBe(200);

    const patch = await request(app)
      .patch(`/api/v1/projects/${projectA}`)
      .set(auth(coordinatorA))
      .send({ title: `Project A ${stamp} (renamed)` });
    expect(patch.status).toBe(200);
    expect(d(patch).project.title).toBe(`Project A ${stamp} (renamed)`);
  });

  it('404s another department project', async () => {
    const show = await request(app).get(`/api/v1/projects/${projectB}`).set(auth(coordinatorA));
    expect(show.status).toBe(404);
    expect(show.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const patch = await request(app)
      .patch(`/api/v1/projects/${projectB}`)
      .set(auth(coordinatorA))
      .send({ title: 'Nope' });
    expect(patch.status).toBe(404);
  });

  it('refuses creating a project for another department student (404)', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set(auth(coordinatorA))
      .send({ studentId: studentB.id, title: 'Foreign', description: 'Nope' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('refuses a foreign workflow but accepts the own one (403 / 201)', async () => {
    const foreign = await request(app)
      .post('/api/v1/projects')
      .set(auth(coordinatorA))
      .send({
        studentId: studentA2.id,
        title: `Foreign workflow ${stamp}`,
        description: 'Nope',
        workflowId: workflowB,
      });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('AUTHORIZATION_ERROR');

    const own = await request(app)
      .post('/api/v1/projects')
      .set(auth(coordinatorA))
      .send({
        studentId: studentA2.id,
        title: `Own workflow ${stamp}`,
        description: 'Yes',
        workflowId: workflowA,
      });
    expect(own.status).toBe(201);
    createdProjectIds.push(d(own).project.id);
    expect(d(own).project.workflowId).toBe(workflowA);
  });
});

describe('proposals — scope and coordinator review', () => {
  it('lists only own-department proposals and guards the student filter', async () => {
    const own = await request(app)
      .get('/api/v1/proposals')
      .query({ studentId: studentA.id })
      .set(auth(coordinatorA));
    expect(own.status).toBe(200);
    expect((d(own).proposals as Array<{ id: string }>).map((row) => row.id)).toContain(
      proposalSubmittedA,
    );

    const foreign = await request(app)
      .get('/api/v1/proposals')
      .query({ studentId: studentB.id })
      .set(auth(coordinatorA));
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('reads an in-department proposal and 404s another department', async () => {
    const own = await request(app)
      .get(`/api/v1/proposals/${proposalSubmittedA}`)
      .set(auth(coordinatorA));
    expect(own.status).toBe(200);

    const foreign = await request(app)
      .get(`/api/v1/proposals/${proposalSubmittedB}`)
      .set(auth(coordinatorA));
    expect(foreign.status).toBe(404);
  });

  it('starts review and records a revision decision in-department', async () => {
    const start = await request(app)
      .post(`/api/v1/proposals/${proposalSubmittedA}/start-review`)
      .set(auth(coordinatorA));
    expect(start.status).toBe(200);
    expect(d(start).proposal.status).toBe('under_review');

    const review = await request(app)
      .post(`/api/v1/proposals/${proposalSubmittedA}/review`)
      .set(auth(coordinatorA))
      .send({ decision: 'revision_required', comment: 'Please tighten the scope.' });
    expect(review.status).toBe(200);
    expect(d(review).proposal.status).toBe('revision_required');
    expect(d(review).review.decision).toBe('revision_required');
    expect(d(review).project).toBeNull();
  });

  it('404s start-review and review on another department proposal', async () => {
    for (const action of ['start-review', 'review']) {
      const res = await request(app)
        .post(`/api/v1/proposals/${proposalSubmittedB}/${action}`)
        .set(auth(coordinatorA))
        .send({ decision: 'revision_required', comment: 'Nope' });
      expect(res.status).toBe(404);
    }
  });

  it('approves a proposal with the unchanged §5.4 side effects', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalUnderReviewA2}/review`)
      .set(auth(coordinatorA))
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    const { proposal, review, project } = d(res);
    expect(proposal.status).toBe('approved');
    expect(proposal.projectId).toBe(project.id);
    expect(project.studentId).toBe(studentA3.id);
    expect(review.decision).toBe('approved');
    createdProjectIds.push(project.id);
  });

  it('keeps proposal writes student-only (403)', async () => {
    const create = await request(app)
      .post('/api/v1/proposals')
      .set(auth(coordinatorA))
      .send({ title: 'Nope', abstract: 'Nope' });
    expect(create.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/proposals/${proposalSubmittedA}`)
      .set(auth(coordinatorA))
      .send({ title: 'Nope' });
    expect(patch.status).toBe(403);

    const submit = await request(app)
      .post(`/api/v1/proposals/${proposalSubmittedA}/submit`)
      .set(auth(coordinatorA));
    expect(submit.status).toBe(403);
  });
});

describe('supervisor assignments — department scope', () => {
  it('assigns a same-department supervisor and records the coordinator', async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentA4.id}/supervisor`)
      .set(auth(coordinatorA))
      .send({ supervisorId: supervisorA.id });

    expect(res.status).toBe(201);
    expect(d(res).assignment.supervisor.id).toBe(supervisorA.id);
    expect(d(res).assignment.assignedBy).toBe(coordinatorA.id);
  });

  it('refuses a cross-department supervisor (404)', async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentA4.id}/supervisor`)
      .set(auth(coordinatorA))
      .send({ supervisorId: supervisorB.id });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('refuses a cross-department student (404)', async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentB.id}/supervisor`)
      .set(auth(coordinatorA))
      .send({ supervisorId: supervisorA.id });

    expect(res.status).toBe(404);
  });

  it('changes and ends a same-department assignment', async () => {
    const change = await request(app)
      .patch(`/api/v1/students/${studentA4.id}/supervisor`)
      .set(auth(coordinatorA))
      .send({ supervisorId: supervisorA2.id });
    expect(change.status).toBe(200);
    expect(d(change).assignment.supervisor.id).toBe(supervisorA2.id);

    const end = await request(app)
      .delete(`/api/v1/students/${studentA4.id}/supervisor`)
      .set(auth(coordinatorA));
    expect(end.status).toBe(200);
    expect(d(end).assignment.endedAt).toBeTruthy();
  });

  it('keeps the super admin cross-department override', async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentA4.id}/supervisor`)
      .set(auth(admin))
      .send({ supervisorId: supervisorB.id });

    expect(res.status).toBe(201);
    expect(d(res).assignment.supervisor.id).toBe(supervisorB.id);
  });
});

describe('read-only oversight', () => {
  it('reads oversight collections in-department and 404s another department', async () => {
    const paths = [
      (id: string) => `/api/v1/projects/${id}/submissions`,
      (id: string) => `/api/v1/projects/${id}/reviews`,
      (id: string) => `/api/v1/projects/${id}/feedback`,
      (id: string) => `/api/v1/projects/${id}/milestones`,
    ];

    for (const path of paths) {
      const own = await request(app).get(path(projectA)).set(auth(coordinatorA));
      expect(own.status).toBe(200);

      const foreign = await request(app).get(path(projectB)).set(auth(coordinatorA));
      expect(foreign.status).toBe(404);
    }
  });

  it('keeps every oversight write out of reach (403)', async () => {
    const writes = [
      request(app)
        .post(`/api/v1/projects/${projectA}/milestones`)
        .set(auth(coordinatorA))
        .send({ name: 'Nope' }),
      request(app)
        .post(`/api/v1/projects/${projectA}/feedback`)
        .set(auth(coordinatorA))
        .send({ body: 'Nope' }),
      request(app)
        .post('/api/v1/submissions')
        .set(auth(coordinatorA))
        .send({}),
      request(app)
        .post(`/api/v1/milestones/${randomUUID()}/status`)
        .set(auth(coordinatorA))
        .send({ status: 'approved' }),
      request(app)
        .post(`/api/v1/submissions/${randomUUID()}/reviews`)
        .set(auth(coordinatorA))
        .send({ decision: 'approved' }),
    ];

    for (const pending of writes) {
      const res = await pending;
      expect(res.status).toBe(403);
    }
  });
});
