import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { departments, users } from '../../src/schema/index.js';

/**
 * Users module — managed departments + registration-number rules
 * (design 2026-10-28; supersedes the §11.0.2 `program` delta).
 *
 *   - students always have a `FAC/YY/DEPT/NNNNN` number (400 when missing
 *     or malformed), and its DEPT segment must equal their department's code
 *     (422 when it does not);
 *   - numbers are unique system-wide, case-insensitively (409);
 *   - supervisors may carry any staff number, or none;
 *   - a student's number can never be cleared (422), and promoting a
 *     supervisor to student requires one;
 *   - grandfathered rows (no number) keep working until an admin fixes them,
 *     and `?missingRegistrationNumber=true` lists exactly those students;
 *   - every user view carries `department: { id, name, code } | null`.
 *
 * Fixtures mint access tokens directly (same payload `signAccessToken`
 * produces); emails and names are UUID-unique so re-runs never collide.
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

const stamp = randomUUID().slice(0, 8);

/** A unique 4-letter department code — the schema accepts `^[A-Z]{2,4}$`. */
function codeFor(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const raw = randomUUID().replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 4; i += 1) code += letters[parseInt(raw[i] ?? '0', 16) % letters.length];
  return code;
}

/** A fresh `FAC/YY/DEPT/NNNNN` number for the given department code. */
function regNo(code: string): string {
  const digits = String(parseInt(randomUUID().slice(0, 6), 16) % 100000).padStart(5, '0');
  return `CST/22/${code}/${digits}`;
}

function tokenFor(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function createUser(role: Role): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `${role}-${id.slice(0, 8)}@integration.test`,
      firstName: 'Users',
      lastName: id.slice(0, 8),
      role,
      isActive: true,
    })
    .returning();
  return { id: row.id, email: row.email, role, token: tokenFor(row) };
}

const auth = (user: TestUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.token}`,
});

/** A fresh active department with a known code. */
async function makeDepartment(code = codeFor()): Promise<{ id: string; name: string; code: string }> {
  const id = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(departments)
    .values({ name: `Department ${id}`, code })
    .returning();
  return { id: row.id, name: row.name, code: row.code! };
}

const createBody = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'New',
  lastName: 'User',
  email: `new-${randomUUID().slice(0, 8)}@integration.test`,
  role: 'student',
  ...overrides,
});

let admin: TestUser;

beforeAll(async () => {
  admin = await createUser('administrator');
});

afterAll(() => db.$client.end());

describe('POST /users — registration numbers', () => {
  it('requires a registration number for students (400)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody());
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details?.some((detail) => detail.path === 'registrationNumber')).toBe(true);
  });

  it('rejects a malformed student number (400)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: 'SWE/22/00825' }));
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });

  it('stores the number trimmed and upper-cased', async () => {
    const department = await makeDepartment();
    const number = regNo(department.code).toLowerCase();

    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: `  ${number}  `, departmentId: department.id }));

    expect(res.status).toBe(201);
    expect(d(res).user.registrationNumber).toBe(number.toUpperCase());
    expect(d(res).user.department).toEqual({
      id: department.id,
      name: department.name,
      code: department.code,
    });
    expect(d(res).user.program).toBeUndefined();
    expect(typeof d(res).user.department).toBe('object');
  });

  it('refuses a number whose DEPT segment differs from the department code (422)', async () => {
    const department = await makeDepartment();
    const otherCode = codeFor();

    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(otherCode), departmentId: department.id }));

    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details?.[0]?.message).toContain(department.code);
  });

  it('refuses a duplicate number, case-insensitively (409)', async () => {
    const department = await makeDepartment();
    const number = regNo(department.code);

    expect(
      (
        await request(app)
          .post('/api/v1/users')
          .set(auth(admin))
          .send(createBody({ registrationNumber: number, departmentId: department.id }))
      ).status,
    ).toBe(201);

    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: number.toLowerCase(), departmentId: department.id }));
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
  });

  it('lets a supervisor have no number, or an arbitrary staff number', async () => {
    const without = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ role: 'supervisor' }));
    expect(without.status).toBe(201);
    expect(d(without).user.registrationNumber).toBeNull();

    const withNumber = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ role: 'supervisor', registrationNumber: `STAFF-${stamp}` }));
    expect(withNumber.status).toBe(201);
    expect(d(withNumber).user.registrationNumber).toBe(`STAFF-${stamp}`.toUpperCase());
  });

  it('validates the department reference (unknown → 400, archived → 400)', async () => {
    const unknown = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo('SWE'), departmentId: randomUUID() }));
    expect(unknown.status).toBe(400);
    expect(e(unknown).code).toBe('VALIDATION_ERROR');

    const archived = await makeDepartment();
    await db.update(departments).set({ archivedAt: new Date() }).where(eq(departments.id, archived.id));

    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(archived.code), departmentId: archived.id }));
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });

  it('accepts an unaffiliated student with a well-formed number', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(codeFor()) }));
    expect(res.status).toBe(201);
    expect(d(res).user.department).toBeNull();
  });
});

describe('GET /users — department views and filters', () => {
  it('returns the nested department on detail and list', async () => {
    const department = await makeDepartment();
    const email = `view-${stamp}@integration.test`;
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ email, registrationNumber: regNo(department.code), departmentId: department.id }));
    expect(created.status).toBe(201);
    const userId = d(created).user.id;

    const detail = await request(app).get(`/api/v1/users/${userId}`).set(auth(admin));
    expect(detail.status).toBe(200);
    expect(d(detail).user.department.id).toBe(department.id);

    const listRes = await request(app)
      .get('/api/v1/users')
      .query({ q: email })
      .set(auth(admin));
    expect(listRes.status).toBe(200);
    const found = d(listRes).users.find((row: any) => row.id === userId);
    expect(found.department.id).toBe(department.id);
    expect(found.department.code).toBe(department.code);
  });

  it('filters by departmentId', async () => {
    const department = await makeDepartment();
    const email = `filter-${stamp}@integration.test`;
    await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ email, registrationNumber: regNo(department.code), departmentId: department.id }));

    const res = await request(app)
      .get('/api/v1/users')
      .query({ departmentId: department.id, limit: 100 })
      .set(auth(admin));
    expect(res.status).toBe(200);
    expect(d(res).users.length).toBeGreaterThan(0);
    expect(d(res).users.every((row: any) => row.department?.id === department.id)).toBe(true);
  });

  it('matches a department name through ?q=', async () => {
    const department = await makeDepartment();
    const email = `search-${stamp}@integration.test`;
    await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ email, registrationNumber: regNo(department.code), departmentId: department.id }));

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: department.name })
      .set(auth(admin));
    expect(res.status).toBe(200);
    expect(d(res).users.some((row: any) => row.email === email)).toBe(true);
  });

  it('lists only students missing a number when ?missingRegistrationNumber=true', async () => {
    // A grandfathered student: direct insert, no number, no department.
    const [legacy] = await db
      .insert(users)
      .values({
        email: `legacy-${stamp}@integration.test`,
        firstName: 'Legacy',
        lastName: 'Student',
        role: 'student',
        registrationNumber: null,
        isActive: true,
      })
      .returning();
    // A supervisor without a number must NOT appear.
    const [supervisor] = await db
      .insert(users)
      .values({
        email: `supervisor-legacy-${stamp}@integration.test`,
        firstName: 'Legacy',
        lastName: 'Supervisor',
        role: 'supervisor',
        registrationNumber: null,
        isActive: true,
      })
      .returning();

    const res = await request(app)
      .get('/api/v1/users')
      .query({ missingRegistrationNumber: 'true', limit: 100 })
      .set(auth(admin));
    expect(res.status).toBe(200);
    const ids = d(res).users.map((row: any) => row.id);
    expect(ids).toContain(legacy.id);
    expect(ids).not.toContain(supervisor.id);
    expect(d(res).users.every((row: any) => row.role === 'student')).toBe(true);
  });
});

describe('PATCH /users/:userId — student identity rules', () => {
  it('sets department and a matching number', async () => {
    const department = await makeDepartment();
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(codeFor()) }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ departmentId: department.id, registrationNumber: regNo(department.code) });

    expect(res.status).toBe(200);
    expect(d(res).user.department.id).toBe(department.id);
  });

  it('refuses to clear a student number (422)', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(codeFor()) }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ registrationNumber: null });
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('refuses a malformed number on patch (400)', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(codeFor()) }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ registrationNumber: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });

  it('re-runs the cross-check when only the department changes (422)', async () => {
    const first = await makeDepartment();
    const second = await makeDepartment();
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(first.code), departmentId: first.id }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ departmentId: second.id });
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('refuses promoting a supervisor to student without a number (422)', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ role: 'supervisor' }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ role: 'student' });
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('promotes a supervisor when a valid number is supplied', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ role: 'supervisor' }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ role: 'student', registrationNumber: regNo(codeFor()) });
    expect(res.status).toBe(200);
    expect(d(res).user.role).toBe('student');
  });

  it('lets a supervisor clear their number', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ role: 'supervisor', registrationNumber: `STAFF-7${stamp}` }));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ registrationNumber: null });
    expect(res.status).toBe(200);
    expect(d(res).user.registrationNumber).toBeNull();
  });

  it('does not block unrelated edits to a grandfathered student', async () => {
    const [legacy] = await db
      .insert(users)
      .values({
        email: `grandfathered-${stamp}@integration.test`,
        firstName: 'Grand',
        lastName: 'Fathered',
        role: 'student',
        registrationNumber: null,
        isActive: true,
      })
      .returning();

    const res = await request(app)
      .patch(`/api/v1/users/${legacy.id}`)
      .set(auth(admin))
      .send({ firstName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(d(res).user.registrationNumber).toBeNull();
  });

  it('keeps an archived department editable for its own members', async () => {
    const department = await makeDepartment();
    const created = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ registrationNumber: regNo(department.code), departmentId: department.id }));

    await db.update(departments).set({ archivedAt: new Date() }).where(eq(departments.id, department.id));

    const res = await request(app)
      .patch(`/api/v1/users/${d(created).user.id}`)
      .set(auth(admin))
      .send({ lastName: 'Still' });
    expect(res.status).toBe(200);
    expect(d(res).user.department.id).toBe(department.id);
  });
});

describe('POST /users/import — department + number rules', () => {
  it('rejects a student row without a number at the schema layer (400)', async () => {
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .send({
        users: [
          {
            firstName: 'No',
            lastName: 'Number',
            email: `imp-none-${stamp}@integration.test`,
            role: 'student',
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('fails rows with an unknown department or a mismatched number (422)', async () => {
    const department = await makeDepartment();
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .send({
        users: [
          {
            firstName: 'Unknown',
            lastName: 'Department',
            email: `imp-unknown-${stamp}@integration.test`,
            role: 'student',
            registrationNumber: regNo('SWE'),
            departmentId: randomUUID(),
          },
          {
            firstName: 'Mismatch',
            lastName: 'Code',
            email: `imp-mismatch-${stamp}@integration.test`,
            role: 'student',
            registrationNumber: regNo(codeFor()),
            departmentId: department.id,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    const paths = e(res).details?.map((detail) => detail.path) ?? [];
    expect(paths).toContain('users.0.departmentId');
    expect(paths).toContain('users.1.registrationNumber');
  });

  it('fails duplicate numbers inside one batch (422)', async () => {
    const department = await makeDepartment();
    const number = regNo(department.code);

    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .send({
        users: [
          {
            firstName: 'Dupe',
            lastName: 'One',
            email: `imp-dupe-a-${stamp}@integration.test`,
            role: 'student',
            registrationNumber: number,
            departmentId: department.id,
          },
          {
            firstName: 'Dupe',
            lastName: 'Two',
            email: `imp-dupe-b-${stamp}@integration.test`,
            role: 'student',
            registrationNumber: number.toLowerCase(),
            departmentId: department.id,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(
      e(res).details?.some((detail) => detail.path === 'users.1.registrationNumber'),
    ).toBe(true);
  });

  it('creates valid rows and returns their departments', async () => {
    const department = await makeDepartment();
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .send({
        users: [
          {
            firstName: 'Import',
            lastName: 'Good',
            email: `imp-good-${stamp}@integration.test`,
            role: 'student',
            registrationNumber: regNo(department.code),
            departmentId: department.id,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(d(res).users[0].department.id).toBe(department.id);
  });
});

describe('re-invite keeps the stored identity fields', () => {
  it('does not overwrite the registration number or department', async () => {
    const department = await makeDepartment();
    const email = `reinvite-${stamp}@integration.test`;
    const number = regNo(department.code);

    await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ email, registrationNumber: number, departmentId: department.id }));

    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send(createBody({ email, registrationNumber: regNo(codeFor()) }));
    expect(res.status).toBe(200);
    expect(d(res).user.registrationNumber).toBe(number);
    expect(d(res).user.department.id).toBe(department.id);
  });
});
