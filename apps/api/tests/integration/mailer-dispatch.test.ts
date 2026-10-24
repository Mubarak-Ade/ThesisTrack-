import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import { users } from '../../src/schema/index.js';

/**
 * Mailer design §12 (integration) — the four flows dispatch emails exactly
 * once, a rolled-back import dispatches none, and a mail failure never changes
 * an endpoint's HTTP status.
 *
 * The mailer module is mocked with importActual so the real no-op sendMail
 * (SMTP unconfigured) still runs — the dispatchers are simply wrapped in spies.
 * "Relay failure leaves status unchanged" is proven structurally at the unit
 * level (mailer-send.test.ts: a rejecting transport still resolves); here we
 * prove the endpoint wiring and the post-commit ordering.
 */

// Wrap the two dispatchers in spies; keep everything else real.
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...actual,
    dispatchInvitationEmail: vi.fn(actual.dispatchInvitationEmail),
    dispatchPasswordResetEmail: vi.fn(actual.dispatchPasswordResetEmail),
  };
});

// Make issueActivationToken throw on demand, to force a mid-tx import rollback.
let failIssueToken = false;
vi.mock('../../src/modules/auth/service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/auth/service.js')>();
  return {
    ...actual,
    issueActivationToken: vi.fn(async (...args: Parameters<typeof actual.issueActivationToken>) => {
      if (failIssueToken) throw new Error('forced mid-transaction failure');
      return actual.issueActivationToken(...args);
    }),
  };
});

import {
  dispatchInvitationEmail,
  dispatchPasswordResetEmail,
} from '../../src/lib/mailer.js';

const d = (res: request.Response): any => res.body.data;

function tokenFor(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function insertUser(role: Role, opts: { isActive?: boolean; passwordHash?: string } = {}) {
  const stamp = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `mailer-${stamp.slice(0, 8)}@integration.test`,
      firstName: 'Mailer',
      lastName: stamp.slice(0, 8),
      role,
      isActive: opts.isActive ?? true,
      passwordHash: opts.passwordHash ?? null,
    })
    .returning();
  return row;
}

async function adminUser() {
  const row = await insertUser('administrator');
  return { id: row.id, email: row.email, role: row.role as Role, token: tokenFor(row) };
}

const auth = (u: { token: string }): { Authorization: string } => ({
  Authorization: `Bearer ${u.token}`,
});

let admin: Awaited<ReturnType<typeof adminUser>>;

beforeAll(async () => {
  admin = await adminUser();
});

beforeEach(() => {
  failIssueToken = false;
  vi.mocked(dispatchInvitationEmail).mockClear();
  vi.mocked(dispatchPasswordResetEmail).mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => db.$client.end());

describe('POST /users — dispatches exactly one invitation email', () => {
  it('calls dispatchInvitationEmail once with the created email and a token', async () => {
    const email = `invite-${randomUUID().slice(0, 8)}@integration.test`;
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send({ firstName: 'A', lastName: 'B', email, role: 'student' });
    expect(res.status).toBe(201);

    expect(dispatchInvitationEmail).toHaveBeenCalledTimes(1);
    const [userArg, tokenArg, expiresArg] = vi.mocked(dispatchInvitationEmail).mock.calls[0];
    expect(userArg.email).toBe(email);
    expect(typeof tokenArg).toBe('string');
    expect(expiresArg).toBeInstanceOf(Date);
  });
});

describe('POST /users/:id/invite — dispatches exactly one invitation email', () => {
  it('calls dispatchInvitationEmail once for the re-invite', async () => {
    const invited = await insertUser('student', { isActive: false });
    const res = await request(app)
      .post(`/api/v1/users/${invited.id}/invite`)
      .set(auth(admin));
    expect(res.status).toBe(200);

    expect(dispatchInvitationEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchInvitationEmail).mock.calls[0][0].email).toBe(invited.email);
  });
});

describe('POST /users/import — post-commit dispatch, once per row', () => {
  it('dispatches one email per imported row after a successful import', async () => {
    const stamp = randomUUID().slice(0, 8);
    const batch = {
      users: [
        { firstName: 'Imp', lastName: 'One', email: `imp-a-${stamp}@integration.test`, role: 'student' },
        { firstName: 'Imp', lastName: 'Two', email: `imp-b-${stamp}@integration.test`, role: 'supervisor' },
        { firstName: 'Imp', lastName: 'Three', email: `imp-c-${stamp}@integration.test`, role: 'student' },
      ],
    };
    const res = await request(app).post('/api/v1/users/import').set(auth(admin)).send(batch);
    expect(res.status).toBe(201);

    expect(dispatchInvitationEmail).toHaveBeenCalledTimes(3);
  });

  it('a ROLLED-BACK import dispatches NOTHING (no pre-commit sends)', async () => {
    const stamp = randomUUID().slice(0, 8);
    const batch = {
      users: [
        { firstName: 'Roll', lastName: 'One', email: `roll-a-${stamp}@integration.test`, role: 'student' },
        { firstName: 'Roll', lastName: 'Two', email: `roll-b-${stamp}@integration.test`, role: 'student' },
      ],
    };

    // Fail the 2nd token issuance → the whole transaction rolls back.
    failIssueToken = true;
    const res = await request(app).post('/api/v1/users/import').set(auth(admin)).send(batch);
    expect(res.status).toBe(500);

    // No email dispatched (rollback) …
    expect(dispatchInvitationEmail).not.toHaveBeenCalled();
    // … and no user row survived the rollback.
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, `roll-a-${stamp}@integration.test`));
    expect(rows).toHaveLength(0);
  });
});

describe('POST /auth/forgot-password — dispatches reset email only for active accounts', () => {
  it('dispatches exactly one reset email for an active user with a password', async () => {
    const hash = await bcrypt.hash('SomePass123!', 4);
    const active = await insertUser('student', { isActive: true, passwordHash: hash });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: active.email });
    expect(res.status).toBe(200);

    expect(dispatchPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchPasswordResetEmail).mock.calls[0][0].email).toBe(active.email);
  });

  it('dispatches NOTHING for an unknown email (no enumeration, no send)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `ghost-${randomUUID().slice(0, 8)}@integration.test` });
    expect(res.status).toBe(200);
    expect(dispatchPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('dispatches NOTHING for an inactive (never-activated) account', async () => {
    const invited = await insertUser('student', { isActive: false });
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: invited.email });
    expect(res.status).toBe(200);
    expect(dispatchPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('mail failure never changes an endpoint status', () => {
  // The relay-failure-independence guarantee is proven structurally in
  // tests/unit/mailer/mailer-send.test.ts: a rejecting transport still makes
  // sendMail RESOLVE, and the dispatchers wrap their synchronous render work in
  // try/catch — so neither a down relay nor a render error can propagate into
  // the response path. Here we only confirm the wiring holds that contract
  // end-to-end: the endpoint returns 201 and the account exists even though
  // (in this suite) no email is actually sent (SMTP unconfigured).
  it('POST /users returns 201 and provisions the account regardless of mail delivery', async () => {
    const email = `nomail-${randomUUID().slice(0, 8)}@integration.test`;
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(admin))
      .send({ firstName: 'A', lastName: 'B', email, role: 'student' });

    expect(res.status).toBe(201);
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });
});
