import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { departments, users } from '../../src/schema/index.js';

/**
 * Coordinator user management — design 2026-11-02 (ADR-17).
 *
 * A coordinator provisions and edits only students/supervisors inside its own
 * department. Cross-department ids are 404 (existence is not disclosed) while
 * cross-department filters/bodies and elevated roles are 403. Only the super
 * admin transfers accounts between departments, and a student transfer needs a
 * registration number matching the new department.
 *
 * Fixtures mint access tokens directly (the same payload `signAccessToken`
 * produces); every email/name/number carries a UUID stamp so re-runs never
 * collide.
 */

interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

const stamp = randomUUID().slice(0, 8);
const emailPrefix = `coord-users-${stamp}`;

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

function regNo(code: string): string {
  const digits = String(parseInt(randomUUID().slice(0, 6), 16) % 100000).padStart(5, '0');
  return `CST/22/${code}/${digits}`;
}

async function insertUser(
  role: Role,
  departmentId: string | null,
  active = true,
): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `${emailPrefix}-${id.slice(0, 8)}@test.local`,
      firstName: 'Coord',
      lastName: id.slice(0, 8),
      role,
      departmentId,
      isActive: active,
      passwordHash: active ? 'hash' : null,
    })
    .returning();
  return { id: row.id, email: row.email, role, token: tokenFor(row) };
}

let departmentA: { id: string; name: string; code: string };
let departmentB: { id: string; name: string; code: string };
let admin: TestUser;
let coordinatorA: TestUser;
let coordinatorB: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let supervisorA: TestUser;
const createdIds: string[] = [];

async function makeDepartment(): Promise<{ id: string; name: string; code: string }> {
  const code = codeFor();
  const [row] = await db
    .insert(departments)
    .values({ name: `Coord Users ${code} ${stamp}`, code })
    .returning();
  return { id: row.id, name: row.name, code: row.code! };
}

beforeAll(async () => {
  departmentA = await makeDepartment();
  departmentB = await makeDepartment();

  admin = await insertUser('administrator', null);
  coordinatorA = await insertUser('coordinator', departmentA.id);
  coordinatorB = await insertUser('coordinator', departmentB.id);
  studentA = await insertUser('student', departmentA.id);
  studentB = await insertUser('student', departmentB.id);
  supervisorA = await insertUser('supervisor', departmentA.id);

  // Real students always carry a number (design 2026-10-28); the fixture does
  // too so department-touching patches exercise the normal path.
  await db
    .update(users)
    .set({ registrationNumber: regNo(departmentA.code) })
    .where(eq(users.id, studentA.id));
  await db
    .update(users)
    .set({ registrationNumber: regNo(departmentB.code) })
    .where(eq(users.id, studentB.id));
});

afterAll(async () => {
  await db.delete(users).where(like(users.email, `${emailPrefix}%`));
  if (createdIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdIds));
  }
  await db.delete(departments).where(inArray(departments.id, [departmentA.id, departmentB.id]));
});

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: 'New',
    lastName: 'Account',
    email: `${emailPrefix}-${randomUUID().slice(0, 8)}@test.local`,
    role: 'student',
    registrationNumber: regNo(departmentA.code),
    ...overrides,
  };
}

async function postUser(
  actor: TestUser,
  body: Record<string, unknown>,
): Promise<request.Response> {
  const res = await request(app).post('/api/v1/users').set(auth(actor)).send(body);
  if (res.status === 201 && d(res)?.user?.id) createdIds.push(d(res).user.id);
  return res;
}

describe('POST /users — provisioning scope', () => {
  it('lets an administrator create a coordinator with a department', async () => {
    const res = await postUser(admin, {
      firstName: 'Coord',
      lastName: 'One',
      email: `${emailPrefix}-admin-coord-${randomUUID().slice(0, 6)}@test.local`,
      role: 'coordinator',
      departmentId: departmentA.id,
    });

    expect(res.status).toBe(201);
    expect(d(res).user.role).toBe('coordinator');
    expect(d(res).user.department.id).toBe(departmentA.id);
  });

  it('rejects an administrator creating a coordinator without a department (400)', async () => {
    const res = await postUser(admin, {
      firstName: 'Coord',
      lastName: 'None',
      email: `${emailPrefix}-admin-coord-null-${randomUUID().slice(0, 6)}@test.local`,
      role: 'coordinator',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('forces a coordinator-created user into the coordinator department', async () => {
    const res = await postUser(coordinatorA, createBody({ role: 'supervisor', registrationNumber: undefined }));

    expect(res.status).toBe(201);
    expect(d(res).user.department.id).toBe(departmentA.id);
  });

  it('refuses another department in the create body (403)', async () => {
    const res = await postUser(coordinatorA, createBody({ departmentId: departmentB.id }));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('refuses creating a coordinator or administrator (403)', async () => {
    for (const role of ['coordinator', 'administrator'] as const) {
      const res = await postUser(
        coordinatorA,
        createBody({
          role,
          email: `${emailPrefix}-${role}-${randomUUID().slice(0, 6)}@test.local`,
          registrationNumber: undefined,
        }),
      );
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    }
  });

  it('refuses re-inviting an out-of-department account (404)', async () => {
    // studentB is invited (no password) and belongs to department B.
    const invitedB = await insertUser('student', departmentB.id, false);
    const res = await postUser(coordinatorA, {
      firstName: 'Taken',
      lastName: 'Email',
      email: invitedB.email,
      role: 'student',
      registrationNumber: regNo(departmentA.code),
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('GET /users — list and detail scope', () => {
  it('lists only own-department students and supervisors', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: stamp, limit: 100 })
      .set(auth(coordinatorA));

    expect(res.status).toBe(200);
    const rows = d(res).users as Array<{ role: string; department: { id: string } | null }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['student', 'supervisor']).toContain(row.role);
      expect(row.department?.id).toBe(departmentA.id);
    }
  });

  it('bounds ?role=administrator to an empty page', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: stamp, role: 'administrator', limit: 100 })
      .set(auth(coordinatorA));

    expect(res.status).toBe(200);
    expect(d(res).users).toEqual([]);
  });

  it('refuses a foreign department filter (403)', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .query({ departmentId: departmentB.id })
      .set(auth(coordinatorA));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('allows the own-department filter', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: stamp, departmentId: departmentA.id })
      .set(auth(coordinatorA));

    expect(res.status).toBe(200);
  });

  it('404s detail for another department and for an elevated role', async () => {
    for (const id of [studentB.id, coordinatorB.id, admin.id]) {
      const res = await request(app).get(`/api/v1/users/${id}`).set(auth(coordinatorA));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('404s the coordinator own account (reached through /auth/me)', async () => {
    const res = await request(app).get(`/api/v1/users/${coordinatorA.id}`).set(auth(coordinatorA));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /users — update scope', () => {
  it('edits a same-department student', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${studentA.id}`)
      .set(auth(coordinatorA))
      .send({ firstName: 'Renamed' });

    expect(res.status).toBe(200);
    expect(d(res).user.firstName).toBe('Renamed');
  });

  it('404s another department and elevated targets', async () => {
    for (const id of [studentB.id, coordinatorB.id, admin.id, coordinatorA.id]) {
      const res = await request(app)
        .patch(`/api/v1/users/${id}`)
        .set(auth(coordinatorA))
        .send({ firstName: 'Nope' });
      expect(res.status).toBe(404);
    }
  });

  it('refuses promoting to an elevated role (403)', async () => {
    for (const role of ['coordinator', 'administrator'] as const) {
      const res = await request(app)
        .patch(`/api/v1/users/${studentA.id}`)
        .set(auth(coordinatorA))
        .send({ role });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    }
  });

  it('refuses moving an account to another department (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${studentA.id}`)
      .set(auth(coordinatorA))
      .send({ departmentId: departmentB.id });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('accepts the own department as a no-op', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${studentA.id}`)
      .set(auth(coordinatorA))
      .send({ departmentId: departmentA.id });

    expect(res.status).toBe(200);
    expect(d(res).user.department.id).toBe(departmentA.id);
  });

  it('scopes invitation resends', async () => {
    const invitedA = await insertUser('supervisor', departmentA.id, false);
    const invitedB = await insertUser('supervisor', departmentB.id, false);

    const ok = await request(app)
      .post(`/api/v1/users/${invitedA.id}/invite`)
      .set(auth(coordinatorA));
    expect(ok.status).toBe(200);

    const denied = await request(app)
      .post(`/api/v1/users/${invitedB.id}/invite`)
      .set(auth(coordinatorA));
    expect(denied.status).toBe(404);
  });
});

describe('POST /users/import — coordinator rules', () => {
  it('forces a missing department into the coordinator department', async () => {
    const email = `${emailPrefix}-import-${randomUUID().slice(0, 6)}@test.local`;
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(coordinatorA))
      .send({
        users: [
          {
            firstName: 'Imported',
            lastName: 'Student',
            email,
            role: 'student',
            registrationNumber: regNo(departmentA.code),
          },
        ],
      });

    expect(res.status).toBe(201);
    createdIds.push(d(res).users[0].id);
    expect(d(res).users[0].department.id).toBe(departmentA.id);
  });

  it('rejects a foreign department row with 422 and writes nothing', async () => {
    const email = `${emailPrefix}-import-foreign-${randomUUID().slice(0, 6)}@test.local`;
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(coordinatorA))
      .send({
        users: [
          {
            firstName: 'Imported',
            lastName: 'Foreign',
            email,
            role: 'student',
            registrationNumber: regNo(departmentB.code),
            departmentId: departmentB.id,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });

  it('rejects an elevated role row with 422 and writes nothing', async () => {
    const email = `${emailPrefix}-import-admin-${randomUUID().slice(0, 6)}@test.local`;
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(coordinatorA))
      .send({
        users: [
          {
            firstName: 'Imported',
            lastName: 'Admin',
            email,
            role: 'administrator',
          },
        ],
      });

    expect(res.status).toBe(422);
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });
});

describe('department transfer — super admin only', () => {
  it('requires a matching registration number when a student changes department', async () => {
    const student = await insertUser('student', departmentA.id);
    await db
      .update(users)
      .set({ registrationNumber: regNo(departmentA.code) })
      .where(eq(users.id, student.id));

    const rejected = await request(app)
      .patch(`/api/v1/users/${student.id}`)
      .set(auth(admin))
      .send({ departmentId: departmentB.id });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe('BUSINESS_RULE_VIOLATION');

    const accepted = await request(app)
      .patch(`/api/v1/users/${student.id}`)
      .set(auth(admin))
      .send({ departmentId: departmentB.id, registrationNumber: regNo(departmentB.code) });
    expect(accepted.status).toBe(200);
    expect(d(accepted).user.department.id).toBe(departmentB.id);
  });

  it('moves a supervisor without a registration-number rule', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${supervisorA.id}`)
      .set(auth(admin))
      .send({ departmentId: departmentB.id });

    expect(res.status).toBe(200);
    expect(d(res).user.department.id).toBe(departmentB.id);
  });

  it('promotes a supervisor to coordinator with the existing department', async () => {
    const supervisor = await insertUser('supervisor', departmentA.id);
    const res = await request(app)
      .patch(`/api/v1/users/${supervisor.id}`)
      .set(auth(admin))
      .send({ role: 'coordinator' });

    expect(res.status).toBe(200);
    expect(d(res).user.role).toBe('coordinator');
    expect(d(res).user.department.id).toBe(departmentA.id);
  });

  it('rejects promoting an unaffiliated supervisor to coordinator (400)', async () => {
    const supervisor = await insertUser('supervisor', null);
    const res = await request(app)
      .patch(`/api/v1/users/${supervisor.id}`)
      .set(auth(admin))
      .send({ role: 'coordinator' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
