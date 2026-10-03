import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { users } from '../../src/schema/index.js';

/**
 * Phase 8 suite — the §11.0.2 PROPOSED delta (user sign-off 2026-10-03):
 * ADR-16's `users.program` write path.
 *
 *   - `POST /users` accepts optional `program` and returns it;
 *   - each `POST /users/import` row carries it;
 *   - `PATCH /users/:userId` sets *and clears* it;
 *   - every `user` object on the users endpoints carries it (the `user`
 *     view is `toPublicUser`, shared by the whole API);
 *   - over-length (256) is rejected by validation (400);
 *   - a re-invite does not move it (consistent with firstName/lastName,
 *     which an existing INVITED row also ignores — recorded decision);
 *   - the empty string is accepted as-is: the delta constrains only
 *     trim / ≤ 255 / nullable, and ADR-16 treats falsy programs as
 *     unaffiliated (`if (program)` → default workflow) anyway.
 *
 * Fixtures mint access tokens directly (same payload `signAccessToken`
 * produces); emails are random-UUID unique so re-runs never collide.
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
      firstName: 'Program',
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

beforeAll(async () => {
  admin = await createUser('administrator');
});

afterAll(() => db.$client.end());

describe('§11.0.2 PROPOSED delta — program write path', () => {
  const email = `program-${randomUUID().slice(0, 8)}@integration.test`;
  let userId = '';

  it('POST /users carries program into the account and the view', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send({
        firstName: 'Proto',
        lastName: 'Type',
        email,
        role: 'student',
        program: '  Computer Science  ', // trimmed by validation
      });
    expect(res.status).toBe(201);
    expect(d(res).user.program).toBe('Computer Science');
    expect(d(res).status).toBe('INVITED');
    userId = d(res).user.id;
  });

  it('GET /users/:userId and the list both return it', async () => {
    const detail = await request(app).get(`/api/v1/users/${userId}`).set(auth(admin));
    expect(detail.status).toBe(200);
    expect(d(detail).user.program).toBe('Computer Science');

    const list = await request(app)
      .get('/api/v1/users')
      .query({ limit: 100, q: email })
      .set(auth(admin));
    expect(list.status).toBe(200);
    const found = d(list).users.find((u: any) => u.id === userId);
    expect(found).toBeDefined();
    expect(found.program).toBe('Computer Science');
  });

  it('PATCH sets it, then clears it with null (NULL = unaffiliated)', async () => {
    const set = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set(auth(admin))
      .send({ program: 'Data Science' });
    expect(set.status).toBe(200);
    expect(d(set).user.program).toBe('Data Science');

    const cleared = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set(auth(admin))
      .send({ program: null });
    expect(cleared.status).toBe(200);
    expect(d(cleared).user.program).toBeNull();

    const detail = await request(app).get(`/api/v1/users/${userId}`).set(auth(admin));
    expect(d(detail).user.program).toBeNull();
  });

  it('the empty string is accepted as-is (the delta names no minimum)', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set(auth(admin))
      .send({ program: '' });
    expect(res.status).toBe(200);
    expect(d(res).user.program).toBe(''); // falsy → ADR-16 falls back anyway
  });

  it('a re-invite does not move program (consistent with the other fields)', async () => {
    const reinviteEmail = `program-${randomUUID().slice(0, 8)}@integration.test`;
    const first = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send({
        firstName: 'Re',
        lastName: 'Invite',
        email: reinviteEmail,
        role: 'student',
        program: 'Original Program',
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send({
        firstName: 'Re',
        lastName: 'Invite',
        email: reinviteEmail,
        role: 'student',
        program: 'Changed Program',
      });
    expect(second.status).toBe(200); // reinvited
    expect(d(second).reinvited).toBe(true);
    expect(d(second).user.program).toBe('Original Program'); // untouched, like firstName
  });

  it('each POST /users/import row carries program', async () => {
    const stamp = randomUUID().slice(0, 8);
    const res = await request(app)
      .post('/api/v1/users/import')
      .set(auth(admin))
      .send({
        users: [
          {
            firstName: 'Bulk',
            lastName: 'One',
            email: `program-a-${stamp}@integration.test`,
            role: 'student',
            program: 'Software Engineering',
          },
          {
            firstName: 'Bulk',
            lastName: 'Two',
            email: `program-b-${stamp}@integration.test`,
            role: 'supervisor',
            // no program → NULL
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(d(res).created).toBe(2);
    expect(d(res).users[0].program).toBe('Software Engineering');
    expect(d(res).users[1].program).toBeNull();

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, `program-a-${stamp}@integration.test`));
    expect(row.program).toBe('Software Engineering');
  });

  it('over-length program → 400 VALIDATION_ERROR on create and on patch', async () => {
    const tooLong = 'x'.repeat(256);
    const create = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send({
        firstName: 'Too',
        lastName: 'Long',
        email: `program-${randomUUID().slice(0, 8)}@integration.test`,
        role: 'student',
        program: tooLong,
      });
    expect(create.status).toBe(400);
    expect(e(create).code).toBe('VALIDATION_ERROR');
    expect(e(create).details?.some((x) => x.path === 'program')).toBe(true);

    const patch = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set(auth(admin))
      .send({ program: tooLong });
    expect(patch.status).toBe(400);
    expect(e(patch).details?.some((x) => x.path === 'program')).toBe(true);
  });
});
