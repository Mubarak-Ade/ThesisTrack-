import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { projects, users } from '../../src/schema/index.js';

/**
 * Phase 14 integration suite — `GET /projects` query surface (§11.2).
 *
 * Covers the Phase 14 delta: `?studentId` narrowing an administrator to one
 * student's rows — the fan-out that powers §16.3's User details "Thesis
 * Assignments" rail. The student self-scope must keep winning over a foreign
 * `studentId`, and a malformed id must land on the field-mapped 400.
 *
 * Fixtures mint access tokens directly (same payload `signAccessToken`
 * produces), matching the other integration suites.
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

async function createProject(student: TestUser, title: string): Promise<string> {
  const [row] = await db
    .insert(projects)
    .values({
      studentId: student.id,
      title,
      description: 'Phase 14 studentId-filter fixture',
      status: 'active',
    })
    .returning();
  return row.id;
}

const auth = (user: TestUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.token}`,
});

let admin: TestUser;
let stA: TestUser;
let stB: TestUser;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  admin = await createUser('administrator');
  stA = await createUser('student');
  stB = await createUser('student');
  projectA = await createProject(stA, 'Phase 14 filter: student A');
  projectB = await createProject(stB, 'Phase 14 filter: student B');
});

afterAll(async () => {
  await db.$client.end();
});

describe('GET /projects ?studentId (§16.3 User details fan-out)', () => {
  it('administrator narrows to one student’s projects', async () => {
    const res = await request(app)
      .get(`/api/v1/projects?studentId=${stA.id}&limit=50`)
      .set(auth(admin));

    expect(res.status).toBe(200);
    const ids = d(res).projects.map((project: { id: string }) => project.id);
    expect(ids).toEqual([projectA]);
    expect(ids).not.toContain(projectB);
  });

  it('a student’s self-scope wins over a foreign studentId', async () => {
    const res = await request(app)
      .get(`/api/v1/projects?studentId=${stA.id}&limit=50`)
      .set(auth(stB));

    expect(res.status).toBe(200);
    const ids = d(res).projects.map((project: { id: string }) => project.id);
    expect(ids).toEqual([projectB]);
    expect(ids).not.toContain(projectA);
  });

  it('rejects a non-uuid studentId with a field-mapped 400', async () => {
    const res = await request(app)
      .get('/api/v1/projects?studentId=nope')
      .set(auth(admin));

    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('studentId');
  });
});
