import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import { departments, users } from '../../src/schema/index.js';

/**
 * Coordinator role invariant — design 2026-11-02 (ADR-17).
 *
 * A coordinator is impossible without a department: the API enforces it and
 * the database is the last line (`users_coordinator_department`). These tests
 * exercise the database directly so a schema regression cannot hide behind the
 * service layer.
 */

const stamp = randomUUID().slice(0, 8);
const departmentName = `Coordinator Dept ${stamp}`;
const departmentCode = `C${stamp.slice(0, 3).toUpperCase()}`;

let departmentId: string;

beforeAll(async () => {
  const [department] = await db
    .insert(departments)
    .values({ name: departmentName, code: departmentCode })
    .returning();
  departmentId = department.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.departmentId, departmentId));
  await db.delete(departments).where(eq(departments.id, departmentId));
});

describe('coordinator role invariant', () => {
  it('rejects a coordinator with no department at the database level', async () => {
    await expect(
      db.insert(users).values({
        email: `coord-no-dept-${stamp}@test.local`,
        firstName: 'No',
        lastName: 'Department',
        role: 'coordinator',
        departmentId: null,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('accepts a coordinator with a department', async () => {
    const [row] = await db
      .insert(users)
      .values({
        email: `coord-ok-${stamp}@test.local`,
        firstName: 'With',
        lastName: 'Department',
        role: 'coordinator',
        departmentId,
      })
      .returning();

    expect(row.role).toBe('coordinator');
    expect(row.departmentId).toBe(departmentId);
  });

  it('creates the scoped-list index', async () => {
    // pg_indexes is stable across the drizzle/push path and the migration chain.
    const result = await db.execute(
      sql`select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = (result.rows as Array<{ indexname: string }>).map((row) => row.indexname);
    expect(names).toContain('idx_users_department_role');
  });

  it('authenticates a coordinator access token', async () => {
    const [coordinator] = await db
      .insert(users)
      .values({
        email: `coord-auth-${stamp}@test.local`,
        firstName: 'Auth',
        lastName: 'Coordinator',
        role: 'coordinator',
        departmentId,
      })
      .returning();

    const token = jwt.sign(
      { sub: coordinator.id, email: coordinator.email, role: coordinator.role, type: 'access' },
      env.JWT_ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('coordinator');
    expect(res.body.data.user.department).toMatchObject({ id: departmentId });
  });
});
