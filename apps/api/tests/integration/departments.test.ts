import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { departments, users, workflows } from '../../src/schema/index.js';

/**
 * Departments module — design 2026-10-28 (PROPOSED ADR-11 reversal).
 *
 *   - administrator CRUD, case-insensitive duplicates among ACTIVE rows (409);
 *   - any authenticated account may read the list (the user form needs it),
 *     but `?includeArchived` / `?missingCode` are administrator-only;
 *   - archiving is refused (409) while an ACTIVE workflow holds the slot,
 *     and succeeds once that workflow is archived;
 *   - reactivation re-checks name/code uniqueness;
 *   - the view carries the slot holder and the attached-student count.
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

/** A unique 4-letter code — the schema accepts `^[A-Z]{2,4}$` only. */
function codeFor(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const raw = randomUUID().replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 4; i += 1) code += letters[parseInt(raw[i] ?? '0', 16) % letters.length];
  return code;
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
      firstName: 'Department',
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

const create = (actor: TestUser, body: Record<string, unknown>) =>
  request(app).post('/api/v1/departments').set(auth(actor)).send(body);

const patch = (actor: TestUser, id: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/v1/departments/${id}`).set(auth(actor)).send(body);

const list = (actor: TestUser, query: Record<string, string> = {}) =>
  request(app).get('/api/v1/departments').query(query).set(auth(actor));

let admin: TestUser;
let student: TestUser;

beforeAll(async () => {
  admin = await createUser('administrator');
  student = await createUser('student');
});

afterAll(() => db.$client.end());

describe('POST /departments', () => {
  it('creates a department, normalising the code to upper case', async () => {
    const name = `Software Engineering ${stamp}`;
    const code = codeFor().toLowerCase();
    const res = await create(admin, { name: `  ${name}  `, code });

    expect(res.status).toBe(201);
    const department = d(res).department;
    expect(department.name).toBe(name);
    expect(department.code).toBe(code.toUpperCase());
    expect(department.archived).toBe(false);
    expect(department.activeWorkflow).toBeNull();
    expect(department.studentCount).toBe(0);
  });

  it('refuses a duplicate active name case-insensitively (409)', async () => {
    const name = `Duplicate Name ${stamp}`;
    expect((await create(admin, { name, code: codeFor() })).status).toBe(201);

    const res = await create(admin, { name: name.toUpperCase(), code: codeFor() });
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
    expect(e(res).message).toMatch(/already exists/i);
  });

  it('refuses a duplicate active code case-insensitively (409)', async () => {
    const code = codeFor();
    expect((await create(admin, { name: `Code Owner ${stamp}`, code })).status).toBe(201);

    const res = await create(admin, { name: `Other Owner ${stamp}`, code: code.toLowerCase() });
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
  });

  it('rejects a malformed code (400)', async () => {
    for (const code of ['S', 'TOOLONG', 'S1', '']) {
      const res = await create(admin, { name: `Bad Code ${stamp}`, code });
      expect(res.status).toBe(400);
      expect(e(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects a missing name (400)', async () => {
    const res = await create(admin, { name: '   ', code: codeFor() });
    expect(res.status).toBe(400);
  });

  it('forbids non-administrators (403)', async () => {
    const res = await create(student, { name: `Forbidden ${stamp}`, code: codeFor() });
    expect(res.status).toBe(403);
    expect(e(res).code).toBe('AUTHORIZATION_ERROR');
  });
});

describe('GET /departments', () => {
  it('is readable by any authenticated account and sorted by name', async () => {
    const res = await list(student, { limit: '100' });
    expect(res.status).toBe(200);
    expect(Array.isArray(d(res).departments)).toBe(true);
    const names = d(res).departments.map((row: any) => row.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('returns active rows only by default', async () => {
    const department = d(await create(admin, { name: `Archived Later ${stamp}`, code: codeFor() }))
      .department;
    expect((await patch(admin, department.id, { archived: true })).status).toBe(200);

    const res = await list(admin, { limit: '100' });
    expect(res.status).toBe(200);
    expect(d(res).departments.some((row: any) => row.id === department.id)).toBe(false);
  });

  it('includes archived rows for an administrator (and refuses a student)', async () => {
    const department = d(await create(admin, { name: `Archived List ${stamp}`, code: codeFor() }))
      .department;
    expect((await patch(admin, department.id, { archived: true })).status).toBe(200);

    const adminRes = await list(admin, { includeArchived: 'true', limit: '100' });
    expect(adminRes.status).toBe(200);
    expect(d(adminRes).departments.some((row: any) => row.id === department.id)).toBe(true);

    const studentRes = await list(student, { includeArchived: 'true' });
    expect(studentRes.status).toBe(403);
  });

  it('filters to rows missing a code for an administrator only', async () => {
    // A legacy row: code NULL (only the backfill creates these).
    const [legacy] = await db
      .insert(departments)
      .values({ name: `Legacy ${stamp}`, code: null })
      .returning();

    const res = await list(admin, { missingCode: 'true', limit: '100' });
    expect(res.status).toBe(200);
    const ids = d(res).departments.map((row: any) => row.id);
    expect(ids).toContain(legacy.id);
    expect(
      d(res).departments.every((row: any) => row.code === null),
    ).toBe(true);

    expect((await list(student, { missingCode: 'true' })).status).toBe(403);
  });

  it('shows the one active workflow and the attached-student count', async () => {
    const department = d(await create(admin, { name: `With Workflow ${stamp}`, code: codeFor() }))
      .department;

    const [workflow] = await db
      .insert(workflows)
      .values({ name: `Department workflow ${stamp}`, departmentId: department.id })
      .returning();

    const [attached] = await db
      .insert(users)
      .values({
        email: `attached-${stamp}@integration.test`,
        firstName: 'Attached',
        lastName: 'Student',
        role: 'student',
        departmentId: department.id,
        registrationNumber: `CST/22/${department.code}/00001`,
        isActive: true,
      })
      .returning();

    const res = await request(app).get(`/api/v1/departments/${department.id}`).set(auth(student));
    expect(res.status).toBe(200);
    expect(d(res).department.activeWorkflow).toEqual({
      id: workflow.id,
      name: workflow.name,
    });
    expect(d(res).department.studentCount).toBe(1);
    expect(d(res).department.id).toBe(department.id);
    expect(attached.id).toBeTruthy();
  });
});

describe('GET /departments/:departmentId', () => {
  it('404s an unknown department and 400s a malformed id', async () => {
    expect(
      (await request(app).get(`/api/v1/departments/${randomUUID()}`).set(auth(student))).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/v1/departments/not-a-uuid').set(auth(student))).status,
    ).toBe(400);
  });
});

describe('PATCH /departments/:departmentId', () => {
  it('renames and re-codes an active department', async () => {
    const created = d(await create(admin, { name: `Rename Me ${stamp}`, code: codeFor() })).department;
    const nextCode = codeFor();

    const res = await patch(admin, created.id, {
      name: `Renamed ${stamp}`,
      code: nextCode.toLowerCase(),
    });
    expect(res.status).toBe(200);
    expect(d(res).department.name).toBe(`Renamed ${stamp}`);
    expect(d(res).department.code).toBe(nextCode.toUpperCase());
  });

  it('refuses a re-code that clashes with another active department (409)', async () => {
    const taken = d(await create(admin, { name: `Taken Code ${stamp}`, code: codeFor() })).department;
    const other = d(await create(admin, { name: `Other Dept ${stamp}`, code: codeFor() })).department;

    const res = await patch(admin, other.id, { code: taken.code });
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
  });

  it('rejects an empty body (400) and forbids non-administrators (403)', async () => {
    const created = d(await create(admin, { name: `Empty Patch ${stamp}`, code: codeFor() })).department;
    expect((await patch(admin, created.id, {})).status).toBe(400);
    expect((await patch(student, created.id, { name: 'Nope' })).status).toBe(403);
  });

  it('refuses to archive while an ACTIVE workflow holds the department (409)', async () => {
    const department = d(await create(admin, { name: `Held Slot ${stamp}`, code: codeFor() }))
      .department;
    const [workflow] = await db
      .insert(workflows)
      .values({ name: `Holding ${stamp}`, departmentId: department.id })
      .returning();

    const refused = await patch(admin, department.id, { archived: true });
    expect(refused.status).toBe(409);
    expect(e(refused).message).toMatch(/workflow/i);

    // Archive the workflow first — the slot is released, the department may go.
    await db
      .update(workflows)
      .set({ archivedAt: new Date() })
      .where(eq(workflows.id, workflow.id));

    const archived = await patch(admin, department.id, { archived: true });
    expect(archived.status).toBe(200);
    expect(d(archived).department.archived).toBe(true);
    expect(d(archived).department.activeWorkflow).toBeNull();

    // Reactivation returns it to the active list.
    const restored = await patch(admin, department.id, { archived: false });
    expect(restored.status).toBe(200);
    expect(d(restored).department.archived).toBe(false);
  });

  it('re-checks name uniqueness when reactivating (409)', async () => {
    const first = d(await create(admin, { name: `Reuse Name ${stamp}`, code: codeFor() })).department;
    expect((await patch(admin, first.id, { archived: true })).status).toBe(200);

    // The name is free among active rows now.
    const replacement = d(
      await create(admin, { name: `Reuse Name ${stamp}`, code: codeFor() }),
    ).department;
    expect(replacement.id).not.toBe(first.id);

    const res = await patch(admin, first.id, { archived: false });
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
  });

  it('never lets a code be cleared (400)', async () => {
    const created = d(await create(admin, { name: `No Clearing ${stamp}`, code: codeFor() }))
      .department;
    const res = await patch(admin, created.id, { code: null });
    expect(res.status).toBe(400);
  });
});

describe('archived departments and the active-name index', () => {
  it('allows an archived row to keep a name an active row now uses', async () => {
    const name = `Historical ${stamp}`;
    const created = d(await create(admin, { name, code: codeFor() })).department;
    expect((await patch(admin, created.id, { archived: true })).status).toBe(200);

    const duplicate = await create(admin, { name, code: codeFor() });
    expect(duplicate.status).toBe(201);

    const row = await db.query.departments.findFirst({
      where: and(eq(departments.id, created.id), isNull(departments.archivedAt)),
    });
    expect(row).toBeUndefined();
  });
});
