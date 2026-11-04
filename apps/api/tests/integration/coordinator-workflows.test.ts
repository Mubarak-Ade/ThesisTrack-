import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, like } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { departments, users, workflows } from '../../src/schema/index.js';

/**
 * Coordinator workflow ownership — design 2026-11-02 (ADR-17, §12).
 *
 * A coordinator reads, creates, patches/archives and duplicates only their own
 * department's definitions. The institution-wide default is invisible (404),
 * changing `departmentId`/`isDefault` is 403, restore is 403, and the hard
 * DELETE stays administrator-only. Duplicating an active source archives it and
 * creates the next active version in one transaction.
 */

interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

type ErrorBody = { code: string; message: string };

const stamp = randomUUID().slice(0, 8);
const namePrefix = `Coord WF ${stamp}`;

const d = (res: request.Response): any => res.body.data;
const e = (res: request.Response): ErrorBody => res.body.error;
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
    .values({ name: `${namePrefix} dept ${code}`, code })
    .returning();
  return { id: row.id, name: row.name, code: row.code! };
}

async function insertUser(role: Role, departmentId: string | null): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `coord-wf-${stamp}-${id.slice(0, 8)}@test.local`,
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

/** §8.10 — ADR-16 branch 3 testability; only repairs an absent seed default. */
async function ensureDefaultWorkflow(): Promise<{ id: string }> {
  const existing = await db.query.workflows.findFirst({
    where: and(isNull(workflows.archivedAt), eq(workflows.isDefault, true)),
    orderBy: [asc(workflows.createdAt), asc(workflows.id)],
  });
  if (existing) return existing;

  const [created] = await db
    .insert(workflows)
    .values({ name: `Default ${stamp}`, isDefault: true, description: 'Test repair' })
    .returning();
  return created;
}

let departmentA: { id: string; name: string; code: string };
let departmentB: { id: string; name: string; code: string };
let admin: TestUser;
let supervisor: TestUser;
let coordinatorA: TestUser;
let workflowA: any;
let workflowB: any;
let defaultWorkflowId = '';

/** The department-A version created by the successful duplicate. */
let workflowA2Id = '';
/** The department-A version created by duplicating the archived source. */
let workflowA3Id = '';
/** The department-A definition created through POST by the coordinator. */
let createdId = '';

beforeAll(async () => {
  departmentA = await makeDepartment();
  departmentB = await makeDepartment();

  admin = await insertUser('administrator', null);
  supervisor = await insertUser('supervisor', null);
  coordinatorA = await insertUser('coordinator', departmentA.id);

  defaultWorkflowId = (await ensureDefaultWorkflow()).id;

  const create = (label: string, departmentId: string) =>
    request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({
        name: `${namePrefix} ${label}`,
        departmentId,
        academicSession: '2026/2027',
        description: `${label} description`,
        stages: [
          {
            name: `${label} one`,
            description: 'First step',
            dueOffsetDays: 14,
            deliverable: 'Draft',
            responsibleRole: 'student',
            requiresSubmission: true,
          },
          { name: `${label} two`, requiresReview: true, requiresApproval: true },
          { name: `${label} three`, responsibleRole: 'supervisor' },
        ],
      });

  const resA = await create('A', departmentA.id);
  expect(resA.status).toBe(201);
  workflowA = d(resA);

  const resB = await create('B', departmentB.id);
  expect(resB.status).toBe(201);
  workflowB = d(resB);
});

afterAll(async () => {
  await db.delete(workflows).where(like(workflows.name, `${namePrefix}%`));
  await db.delete(users).where(like(users.email, `coord-wf-${stamp}%`));
  await db
    .delete(departments)
    .where(inArray(departments.id, [departmentA.id, departmentB.id]));
});

describe('workflow reads — department scope', () => {
  it('lists only own-department definitions, never the default', async () => {
    const res = await request(app)
      .get('/api/v1/workflows')
      .query({ limit: 100 })
      .set(auth(coordinatorA));

    expect(res.status).toBe(200);
    const ids = (d(res).workflows as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(workflowA.workflow.id);
    expect(ids).not.toContain(workflowB.workflow.id);
    expect(ids).not.toContain(defaultWorkflowId);
  });

  it('refuses a foreign department filter (403)', async () => {
    const res = await request(app)
      .get('/api/v1/workflows')
      .query({ departmentId: departmentB.id })
      .set(auth(coordinatorA));

    expect(res.status).toBe(403);
    expect(e(res).code).toBe('AUTHORIZATION_ERROR');
  });

  it('reads own detail and 404s foreign + default definitions', async () => {
    const own = await request(app)
      .get(`/api/v1/workflows/${workflowA.workflow.id}`)
      .set(auth(coordinatorA));
    expect(own.status).toBe(200);
    expect(d(own).stages).toHaveLength(3);

    for (const id of [workflowB.workflow.id, defaultWorkflowId]) {
      const res = await request(app).get(`/api/v1/workflows/${id}`).set(auth(coordinatorA));
      expect(res.status).toBe(404);
      expect(e(res).code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('leaves supervisor read access untouched', async () => {
    const res = await request(app)
      .get('/api/v1/workflows')
      .query({ limit: 100 })
      .set(auth(supervisor));
    expect(res.status).toBe(200);
    const ids = (d(res).workflows as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(workflowA.workflow.id);
    expect(ids).toContain(workflowB.workflow.id);
  });
});

describe('workflow create — forced department', () => {
  it('refuses another department and the catch-all (403)', async () => {
    for (const departmentId of [departmentB.id, null]) {
      const res = await request(app)
        .post('/api/v1/workflows')
        .set(auth(coordinatorA))
        .send({ name: `${namePrefix} rejected`, departmentId });
      expect(res.status).toBe(403);
      expect(e(res).code).toBe('AUTHORIZATION_ERROR');
    }
  });
});

describe('duplicate as a new version', () => {
  it('archives an active source and creates the next active version', async () => {
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowA.workflow.id}/duplicate`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} A v2` });

    expect(res.status).toBe(201);
    const body = d(res);
    expect(body.archivedWorkflowId).toBe(workflowA.workflow.id);
    expect(body.workflow).toMatchObject({
      name: `${namePrefix} A v2`,
      departmentId: departmentA.id,
      academicSession: '2026/2027',
      description: 'A description',
      isDefault: false,
      archivedAt: null,
      createdBy: coordinatorA.id,
    });
    expect(body.workflow.id).not.toBe(workflowA.workflow.id);
    expect(body.stages.map((stage: any) => stage.position)).toEqual([1, 2, 3]);
    expect(body.stages.map((stage: any) => stage.name)).toEqual([
      'A one',
      'A two',
      'A three',
    ]);
    expect(body.stages[0]).toMatchObject({
      dueOffsetDays: 14,
      deliverable: 'Draft',
      responsibleRole: 'student',
      requiresSubmission: true,
    });
    expect(body.stages[1]).toMatchObject({ requiresReview: true, requiresApproval: true });

    // The source is archived, not deleted, and its stages still exist.
    const [source] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, workflowA.workflow.id));
    expect(source.archivedAt).not.toBeNull();

    workflowA2Id = body.workflow.id;
  });

  it('shows the archived version only with includeArchived', async () => {
    const active = await request(app)
      .get('/api/v1/workflows')
      .query({ limit: 100 })
      .set(auth(coordinatorA));
    const activeIds = (d(active).workflows as Array<{ id: string }>).map((row) => row.id);
    expect(activeIds).toContain(workflowA2Id);
    expect(activeIds).not.toContain(workflowA.workflow.id);

    const all = await request(app)
      .get('/api/v1/workflows')
      .query({ limit: 100, includeArchived: 'true' })
      .set(auth(coordinatorA));
    const allIds = (d(all).workflows as Array<{ id: string }>).map((row) => row.id);
    expect(allIds).toContain(workflowA2Id);
    expect(allIds).toContain(workflowA.workflow.id);
  });

  it('duplicates an already-archived source without archiving anything', async () => {
    // Free the slot first: the v2 active version must be retired.
    const archive = await request(app)
      .patch(`/api/v1/workflows/${workflowA2Id}`)
      .set(auth(coordinatorA))
      .send({ archived: true });
    expect(archive.status).toBe(200);

    const res = await request(app)
      .post(`/api/v1/workflows/${workflowA.workflow.id}/duplicate`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} A v3` });

    expect(res.status).toBe(201);
    expect(d(res).archivedWorkflowId).toBeNull();
    expect(d(res).workflow.archivedAt).toBeNull();
    workflowA3Id = d(res).workflow.id;
  });

  it('409s when another active workflow holds the slot, writing nothing', async () => {
    const before = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(like(workflows.name, `${namePrefix}%`));

    const res = await request(app)
      .post(`/api/v1/workflows/${workflowA.workflow.id}/duplicate`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} A v4` });

    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');

    const after = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(like(workflows.name, `${namePrefix}%`));
    expect(after).toHaveLength(before.length);
    expect(after.map((row) => row.id)).toContain(workflowA3Id);
  });

  it('404s another department source (coordinator) and 422s the default (admin)', async () => {
    const foreign = await request(app)
      .post(`/api/v1/workflows/${workflowB.workflow.id}/duplicate`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} nope` });
    expect(foreign.status).toBe(404);

    // Scope wins first: the catch-all is not a coordinator resource (404).
    const scopedDefault = await request(app)
      .post(`/api/v1/workflows/${defaultWorkflowId}/duplicate`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} nope` });
    expect(scopedDefault.status).toBe(404);

    // The super admin reaches the business rule: the default has no slot (422).
    const fallback = await request(app)
      .post(`/api/v1/workflows/${defaultWorkflowId}/duplicate`)
      .set(auth(admin))
      .send({ name: `${namePrefix} nope` });
    expect(fallback.status).toBe(422);
    expect(e(fallback).code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('validates a required name (400)', async () => {
    const res = await request(app)
      .post(`/api/v1/workflows/${workflowA.workflow.id}/duplicate`)
      .set(auth(coordinatorA))
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });
});

describe('workflow patch — scope, archive and immutable fields', () => {
  it('404s another department and the default', async () => {
    for (const id of [workflowB.workflow.id, defaultWorkflowId]) {
      const res = await request(app)
        .patch(`/api/v1/workflows/${id}`)
        .set(auth(coordinatorA))
        .send({ name: `${namePrefix} nope` });
      expect(res.status).toBe(404);
    }
  });

  it('refuses department, default and restore changes (403)', async () => {
    const bodies = [
      { departmentId: departmentA.id },
      { departmentId: null },
      { isDefault: true },
      { archived: false },
    ];

    for (const body of bodies) {
      const res = await request(app)
        .patch(`/api/v1/workflows/${workflowA3Id}`)
        .set(auth(coordinatorA))
        .send(body);
      expect(res.status).toBe(403);
      expect(e(res).code).toBe('AUTHORIZATION_ERROR');
    }
  });

  it('edits an active definition in place', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${workflowA3Id}`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} A v3 renamed` });
    expect(res.status).toBe(200);
    expect(d(res).workflow.name).toBe(`${namePrefix} A v3 renamed`);
  });

  it('archives an active definition, then treats it as read-only', async () => {
    const archive = await request(app)
      .patch(`/api/v1/workflows/${workflowA3Id}`)
      .set(auth(coordinatorA))
      .send({ archived: true });
    expect(archive.status).toBe(200);
    expect(d(archive).workflow.archivedAt).not.toBeNull();

    const edit = await request(app)
      .patch(`/api/v1/workflows/${workflowA3Id}`)
      .set(auth(coordinatorA))
      .send({ name: `${namePrefix} nope` });
    expect(edit.status).toBe(403);
    expect(e(edit).code).toBe('AUTHORIZATION_ERROR');

    const restore = await request(app)
      .patch(`/api/v1/workflows/${workflowA3Id}`)
      .set(auth(coordinatorA))
      .send({ archived: false });
    expect(restore.status).toBe(403);
  });

  it('creates with an omitted department, forced to the coordinator department', async () => {
    const res = await request(app)
      .post('/api/v1/workflows')
      .set(auth(coordinatorA))
      .send({
        name: `${namePrefix} created`,
        stages: [{ name: 'Only stage', requiresSubmission: true }],
      });

    expect(res.status).toBe(201);
    expect(d(res).workflow.departmentId).toBe(departmentA.id);
    expect(d(res).workflow.createdBy).toBe(coordinatorA.id);
    createdId = d(res).workflow.id;
  });

  it('keeps hard DELETE administrator-only', async () => {
    const res = await request(app)
      .delete(`/api/v1/workflows/${createdId}`)
      .set(auth(coordinatorA));
    expect(res.status).toBe(403);
  });
});
