import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';

import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import { authenticate, type AuthUser } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/error.js';
import {
  departmentScope,
  isCoordinatorInDepartment,
  requireDepartmentScope,
} from '../../src/authz/scope.js';
import { requireStudentAccess } from '../../src/authz/resource.js';
import { getProjectAccess } from '../../src/authz/access.js';
import { resolveProposalAccess } from '../../src/authz/proposal-access.js';
import { AuthorizationError } from '../../src/errors/index.js';
import {
  departments,
  projects,
  proposals,
  users,
} from '../../src/schema/index.js';

/**
 * Department scope — design 2026-11-02 (ADR-17).
 *
 * The guard resolves a coordinator's department from the DATABASE on every
 * request (never a JWT claim). These tests cover that resolution and the
 * resource-level access levels it feeds, without depending on the modules that
 * are scoped in later phases.
 */

interface TestUser {
  id: string;
  email: string;
  role: AuthUser['role'];
  token: string;
}

const stamp = randomUUID().slice(0, 8);

let departmentA: string;
let departmentB: string;
let coordinatorA: TestUser;
let coordinatorB: TestUser;
let coordinatorWithoutRow: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let admin: TestUser;
let projectA: string;
let projectB: string;
let proposalA: string;
let proposalB: string;

function tokenFor(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function insertUser(
  role: AuthUser['role'],
  departmentId: string | null,
): Promise<TestUser> {
  const [row] = await db
    .insert(users)
    .values({
      email: `scope-${role}-${randomUUID()}@test.local`,
      firstName: 'Scope',
      lastName: role,
      role,
      departmentId,
    })
    .returning();
  return { id: row.id, email: row.email, role: row.role as AuthUser['role'], token: tokenFor(row) };
}

function probeApp() {
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.get('/probe', requireDepartmentScope(), (req, res) => {
    res.json({ success: true, data: { departmentId: req.user?.departmentId ?? null } });
  });
  app.get(
    '/students/:studentId',
    requireDepartmentScope(),
    requireStudentAccess(),
    (_req, res) => {
      res.json({ success: true, data: {} });
    },
  );
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  const [a] = await db
    .insert(departments)
    .values({ name: `Scope A ${stamp}`, code: `SA${stamp.slice(0, 2).toUpperCase()}` })
    .returning();
  const [b] = await db
    .insert(departments)
    .values({ name: `Scope B ${stamp}`, code: `SB${stamp.slice(0, 2).toUpperCase()}` })
    .returning();
  departmentA = a.id;
  departmentB = b.id;

  admin = await insertUser('administrator', null);
  coordinatorA = await insertUser('coordinator', departmentA);
  coordinatorB = await insertUser('coordinator', departmentB);
  coordinatorWithoutRow = {
    id: randomUUID(),
    email: `missing-${stamp}@test.local`,
    role: 'coordinator',
    token: '',
  };
  coordinatorWithoutRow.token = tokenFor(coordinatorWithoutRow);
  studentA = await insertUser('student', departmentA);
  studentB = await insertUser('student', departmentB);

  const [pa] = await db
    .insert(projects)
    .values({ studentId: studentA.id, title: 'Project A', description: 'A' })
    .returning();
  const [pb] = await db
    .insert(projects)
    .values({ studentId: studentB.id, title: 'Project B', description: 'B' })
    .returning();
  projectA = pa.id;
  projectB = pb.id;

  const [propa] = await db
    .insert(proposals)
    .values({ studentId: studentA.id, title: 'Proposal A', abstract: 'A' })
    .returning();
  const [propb] = await db
    .insert(proposals)
    .values({ studentId: studentB.id, title: 'Proposal B', abstract: 'B' })
    .returning();
  proposalA = propa.id;
  proposalB = propb.id;
});

afterAll(async () => {
  await db.delete(proposals).where(inArray(proposals.id, [proposalA, proposalB]));
  await db.delete(projects).where(inArray(projects.id, [projectA, projectB]));
  await db
    .delete(users)
    .where(
      inArray(users.id, [admin.id, coordinatorA.id, coordinatorB.id, studentA.id, studentB.id]),
    );
  await db.delete(departments).where(inArray(departments.id, [departmentA, departmentB]));
});

describe('departmentScope', () => {
  it('is unrestricted for administrators and non-coordinators', () => {
    expect(departmentScope({ id: admin.id, email: admin.email, role: 'administrator' })).toBeNull();
    expect(departmentScope({ id: studentA.id, email: studentA.email, role: 'student' })).toBeNull();
  });

  it('returns the coordinator department', () => {
    expect(
      departmentScope({
        id: coordinatorA.id,
        email: coordinatorA.email,
        role: 'coordinator',
        departmentId: departmentA,
      }),
    ).toBe(departmentA);
  });

  it('fails closed when a coordinator has no resolved department', () => {
    expect(() =>
      departmentScope({ id: coordinatorA.id, email: coordinatorA.email, role: 'coordinator' }),
    ).toThrow(AuthorizationError);
  });

  it('compares departments only for coordinators', () => {
    expect(isCoordinatorInDepartment({ ...coordinatorA, departmentId: departmentA }, departmentA)).toBe(
      true,
    );
    expect(isCoordinatorInDepartment({ ...coordinatorA, departmentId: departmentA }, departmentB)).toBe(
      false,
    );
    expect(isCoordinatorInDepartment({ ...admin, departmentId: departmentA }, departmentA)).toBe(false);
  });
});

describe('requireDepartmentScope', () => {
  it('lets an administrator through without a department', async () => {
    const res = await request(probeApp())
      .get('/probe')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.departmentId).toBeNull();
  });

  it('resolves and attaches the coordinator department', async () => {
    const res = await request(probeApp())
      .get('/probe')
      .set('Authorization', `Bearer ${coordinatorA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.departmentId).toBe(departmentA);
  });

  it('refuses a coordinator whose account row cannot be resolved', async () => {
    const res = await request(probeApp())
      .get('/probe')
      .set('Authorization', `Bearer ${coordinatorWithoutRow.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('leaves students and supervisors unchanged', async () => {
    const res = await request(probeApp())
      .get('/probe')
      .set('Authorization', `Bearer ${studentA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.departmentId).toBeNull();
  });
});

describe('resource access levels', () => {
  it('resolves a project as coordinator only inside the department', async () => {
    const projectARow = (await db.query.projects.findFirst({
      where: eq(projects.id, projectA),
    }))!;
    const projectBRow = (await db.query.projects.findFirst({
      where: eq(projects.id, projectB),
    }))!;

    expect(
      await getProjectAccess({ ...coordinatorA, departmentId: departmentA }, projectARow),
    ).toBe('coordinator');
    expect(
      await getProjectAccess({ ...coordinatorA, departmentId: departmentA }, projectBRow),
    ).toBeNull();
    expect(await getProjectAccess(coordinatorA, projectARow)).toBeNull();
  });

  it('resolves a proposal as coordinator only inside the department', async () => {
    expect(
      await resolveProposalAccess({ studentId: studentA.id }, { ...coordinatorA, departmentId: departmentA }),
    ).toBe('coordinator');
    expect(
      await resolveProposalAccess({ studentId: studentB.id }, { ...coordinatorA, departmentId: departmentA }),
    ).toBeNull();
  });

  it('lets a coordinator read an in-department student and 404s another', async () => {
    const inScope = await request(probeApp())
      .get(`/students/${studentA.id}`)
      .set('Authorization', `Bearer ${coordinatorA.token}`);
    expect(inScope.status).toBe(200);

    const outOfScope = await request(probeApp())
      .get(`/students/${studentB.id}`)
      .set('Authorization', `Bearer ${coordinatorA.token}`);
    expect(outOfScope.status).toBe(404);
  });
});
