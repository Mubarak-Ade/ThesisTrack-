import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { inArray, like, sql } from 'drizzle-orm';

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
  workflows,
} from '../../src/schema/index.js';

/**
 * Project library — design 2026-11-05 (ADR-18).
 *
 * This suite exercises the real SQL end to end: the read model, the full-text
 * + trigram matcher, the department facet, supervisor hydration and the
 * read-only access matrix. It also pins the coordinator exception: the library
 * is institution-wide for a coordinator, while every other module stays
 * department-scoped.
 */

interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

const stamp = randomUUID().slice(0, 8);
const emailPrefix = `project-library-${stamp}`;

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
    .values({ name: `Library ${code} ${stamp}`, code })
    .returning();
  return { id: row.id, name: row.name, code: row.code! };
}

async function insertUser(role: Role, departmentId: string | null): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `${emailPrefix}-${id.slice(0, 8)}@test.local`,
      firstName: 'Lib',
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
let coordinatorB: TestUser;
let supervisorA: TestUser;
let supervisorA2: TestUser;
let supervisorB: TestUser;
let studentA1: TestUser;
let studentA2: TestUser;
let studentB: TestUser;
let workflowA: string;
let workflowB: string;

let projectAlpha: string;
let projectBeta: string;
let projectGamma: string;
let projectDelta: string;
let proposalAlpha: string;
let proposalBeta: string;
let proposalGamma: string;

/** Unique markers used to prove the corpus boundaries. */
const BODY_TOKEN = 'xylophoniczephyr';
const ABSTRACT_TOKEN = 'thematicanalysis';
const SUBMITTED_TOKEN = 'oceanicdrifter';
const PROJECT_IDS: string[] = [];

beforeAll(async () => {
  departmentA = await makeDepartment();
  departmentB = await makeDepartment();

  admin = await insertUser('administrator', null);
  coordinatorA = await insertUser('coordinator', departmentA.id);
  coordinatorB = await insertUser('coordinator', departmentB.id);
  supervisorA = await insertUser('supervisor', departmentA.id);
  supervisorA2 = await insertUser('supervisor', departmentA.id);
  supervisorB = await insertUser('supervisor', departmentB.id);
  studentA1 = await insertUser('student', departmentA.id);
  studentA2 = await insertUser('student', departmentA.id);
  studentB = await insertUser('student', departmentB.id);

  const [wfA] = await db
    .insert(workflows)
    .values({
      name: `Library workflow A ${stamp}`,
      departmentId: departmentA.id,
      academicSession: '2025/2026',
      createdBy: admin.id,
    })
    .returning();
  const [wfB] = await db
    .insert(workflows)
    .values({
      name: `Library workflow B ${stamp}`,
      departmentId: departmentB.id,
      academicSession: '2024/2025',
      createdBy: admin.id,
    })
    .returning();
  workflowA = wfA.id;
  workflowB = wfB.id;

  const [alpha] = await db
    .insert(projects)
    .values({
      studentId: studentA1.id,
      title: `Photovoltaic scheduling ledger for campus energy ${stamp}`,
      description:
        'A planning tool that matches solar generation to campus load using a shared ledger.',
      status: 'active',
      workflowId: workflowA,
    })
    .returning();
  const [beta] = await db
    .insert(projects)
    .values({
      studentId: studentA2.id,
      title: `Campus solar generation ledger and load matching ${stamp}`,
      description:
        'Schedules photovoltaic output against building demand with a shared ledger.',
      status: 'completed',
      workflowId: workflowA,
    })
    .returning();
  const [gamma] = await db
    .insert(projects)
    .values({
      studentId: studentB.id,
      title: `Coral reef biodiversity survey ${stamp}`,
      description: 'Field survey of coral species richness and bleaching recovery.',
      status: 'archived',
      workflowId: workflowB,
    })
    .returning();
  const [delta] = await db
    .insert(projects)
    .values({
      studentId: studentB.id,
      title: `Marine microplastic concentration survey ${stamp}`,
      description: 'Sampling microplastic density along the shoreline.',
      status: 'completed',
      workflowId: workflowB,
    })
    .returning();

  projectAlpha = alpha.id;
  projectBeta = beta.id;
  projectGamma = gamma.id;
  projectDelta = delta.id;
  PROJECT_IDS.push(projectAlpha, projectBeta, projectGamma, projectDelta);

  const [prAlpha] = await db
    .insert(proposals)
    .values({
      studentId: studentA1.id,
      projectId: projectAlpha,
      version: 1,
      title: `Photovoltaic scheduling ledger proposal ${stamp}`,
      abstract:
        'An approved proposal about solar generation scheduling for the campus microgrid, using thematicanalysis.',
      body: `<p>The system stores generation and demand in a <strong>${BODY_TOKEN}</strong> ledger for R&amp;D.</p>`,
      status: 'approved',
      submittedAt: new Date(),
    })
    .returning();
  const [prBeta] = await db
    .insert(proposals)
    .values({
      studentId: studentA2.id,
      projectId: projectBeta,
      version: 1,
      title: `Campus solar generation proposal ${stamp}`,
      abstract: 'Approved proposal on photovoltaic output and building demand.',
      body: '<p>Load matching.</p>',
      status: 'approved',
      submittedAt: new Date(),
    })
    .returning();
  const [prGamma] = await db
    .insert(proposals)
    .values({
      studentId: studentB.id,
      projectId: projectGamma,
      version: 1,
      title: `Coral reef biodiversity proposal ${stamp}`,
      abstract: 'Approved proposal on coral reefs.',
      status: 'approved',
      submittedAt: new Date(),
    })
    .returning();
  await db.insert(proposals).values({
    // Submitted, never approved: this text must stay out of the corpus.
    studentId: studentB.id,
    projectId: projectDelta,
    version: 1,
    title: `Submitted microplastic survey ${stamp}`,
    abstract: `Only a submitted proposal contains ${SUBMITTED_TOKEN}.`,
    status: 'submitted',
    submittedAt: new Date(),
  });
  proposalAlpha = prAlpha.id;
  proposalBeta = prBeta.id;
  proposalGamma = prGamma.id;

  await db.insert(supervisorAssignments).values([
    // Primary, active and project-linked.
    {
      studentId: studentA1.id,
      projectId: projectAlpha,
      supervisorId: supervisorA.id,
      isPrimary: true,
    },
    // Historical: ended, still linked, must stay visible.
    {
      studentId: studentA1.id,
      projectId: projectAlpha,
      supervisorId: supervisorA2.id,
      isPrimary: false,
      endedAt: new Date(),
    },
    // No linked row: the detail/fallback path uses the student's active assignment.
    {
      studentId: studentA2.id,
      projectId: null,
      supervisorId: supervisorA2.id,
      isPrimary: true,
    },
    {
      studentId: studentB.id,
      projectId: projectGamma,
      supervisorId: supervisorB.id,
      isPrimary: true,
    },
  ]);
});

afterAll(async () => {
  const studentIds = [studentA1.id, studentA2.id, studentB.id];
  await db.delete(proposals).where(inArray(proposals.studentId, studentIds));
  await db.delete(supervisorAssignments).where(
    inArray(supervisorAssignments.studentId, studentIds),
  );
  await db.delete(projects).where(inArray(projects.id, PROJECT_IDS));
  await db.delete(workflows).where(inArray(workflows.id, [workflowA, workflowB]));
  await db.delete(users).where(like(users.email, `${emailPrefix}%`));
  await db.delete(departments).where(inArray(departments.id, [departmentA.id, departmentB.id]));
});

describe('access matrix', () => {
  it('allows supervisor, coordinator and administrator', async () => {
    for (const user of [supervisorA, coordinatorA, admin]) {
      const res = await request(app).get('/api/v1/project-library').set(auth(user));
      expect(res.status, `${user.role} should read the library`).toBe(200);
    }
  });

  it('refuses a student (403) and an anonymous caller (401)', async () => {
    const library = await request(app).get('/api/v1/project-library').set(auth(studentA1));
    expect(library.status).toBe(403);

    const detail = await request(app)
      .get(`/api/v1/project-library/${projectAlpha}`)
      .set(auth(studentA1));
    expect(detail.status).toBe(403);

    const check = await request(app)
      .post('/api/v1/project-library/similarity-check')
      .set(auth(studentA1))
      .send({ title: 't', description: 'd' });
    expect(check.status).toBe(403);

    for (const call of [
      request(app).get('/api/v1/project-library'),
      request(app).get(`/api/v1/project-library/${projectAlpha}`),
      request(app)
        .post('/api/v1/project-library/similarity-check')
        .send({ title: 't', description: 'd' }),
    ]) {
      expect((await call).status).toBe(401);
    }
  });

  it('is institution-wide for a coordinator (the one ADR-18 exception)', async () => {
    const res = await request(app)
      .get('/api/v1/project-library')
      .query({ q: stamp, limit: 50 })
      .set(auth(coordinatorA));

    expect(res.status).toBe(200);
    const ids = (d(res).projects as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(projectAlpha);
    expect(ids).toContain(projectGamma);
  });
});

describe('search', () => {
  const search = (q: string, extra: Record<string, unknown> = {}) =>
    request(app)
      .get('/api/v1/project-library')
      .query({ q, limit: 50, ...extra })
      .set(auth(supervisorA));

  it('matches project and approved-proposal text, ranked with an excerpt', async () => {
    const res = await search('photovoltaic');
    expect(res.status).toBe(200);

    const rows = d(res).projects as Array<{
      id: string;
      score: number | null;
      excerpt: string | null;
    }>;
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(projectAlpha);
    expect(ids).toContain(projectBeta);
    expect(ids).not.toContain(projectGamma);

    const alpha = rows.find((row) => row.id === projectAlpha)!;
    expect(alpha.score).toBeGreaterThan(0);
    expect(alpha.excerpt).toBeTruthy();
    expect(alpha.excerpt).not.toMatch(/<[^>]+>/);
  });

  it('indexes the approved proposal body only', async () => {
    const body = await search(BODY_TOKEN);
    expect(
      (d(body).projects as Array<{ id: string }>).map((row) => row.id),
    ).toEqual([projectAlpha]);

    // Same shape of token, but the proposal is only `submitted`.
    const submitted = await search(SUBMITTED_TOKEN);
    expect(d(submitted).projects).toHaveLength(0);
    expect(d(submitted).pagination.total).toBe(0);
  });

  it('indexes approved proposal abstracts and decodes entities in excerpts', async () => {
    const abstract = await search(ABSTRACT_TOKEN);
    expect((d(abstract).projects as Array<{ id: string }>).map((row) => row.id)).toEqual([
      projectAlpha,
    ]);

    const body = await search(BODY_TOKEN);
    const [row] = d(body).projects as Array<{ excerpt: string | null }>;
    expect(row?.excerpt).toContain('R&D');
    expect(row?.excerpt).not.toContain('&amp;');
  });

  it('still matches a project with no approved proposal by title and description', async () => {
    const res = await search('microplastic');
    expect(res.status).toBe(200);

    const rows = d(res).projects as Array<{ id: string; excerpt: string | null }>;
    expect(rows.map((row) => row.id)).toContain(projectDelta);
    const delta = rows.find((row) => row.id === projectDelta)!;
    expect(delta.excerpt).toContain('microplastic');
  });

  it('returns an empty page for an unmatched token, not an error', async () => {
    const res = await search('nonexistenttermzzz');
    expect(res.status).toBe(200);
    expect(d(res).projects).toHaveLength(0);
  });

  it('rejects malformed query parameters', async () => {
    for (const query of [{ limit: '51' }, { status: 'deleted' }, { q: 'x'.repeat(201) }]) {
      const res = await request(app)
        .get('/api/v1/project-library')
        .query(query)
        .set(auth(admin));
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('finds a reworded topic through trigram similarity', async () => {
    const res = await search('solar photovoltaic scheduling campus');
    expect(res.status).toBe(200);

    const rows = d(res).projects as Array<{ id: string; score: number }>;
    expect(rows.map((row) => row.id)).toContain(projectAlpha);
    expect(rows.map((row) => row.id)).not.toContain(projectGamma);
    expect(rows.every((row) => row.score >= 0)).toBe(true);
  });

  it('returns an empty page for a one-character query without scanning', async () => {
    const res = await search('p');
    expect(res.status).toBe(200);
    expect(d(res).projects).toHaveLength(0);
    expect(d(res).pagination.total).toBe(0);
    expect(d(res).departments).toEqual([]);
  });

  it('filters by status and department, with a department facet', async () => {
    const archived = await search(stamp, { status: 'archived' });
    expect((d(archived).projects as Array<{ id: string }>).map((row) => row.id)).toEqual([
      projectGamma,
    ]);

    const inA = await search(stamp, { departmentId: departmentA.id });
    const idsA = (d(inA).projects as Array<{ id: string }>).map((row) => row.id);
    expect(idsA).toEqual(expect.arrayContaining([projectAlpha, projectBeta]));
    expect(idsA).not.toContain(projectGamma);

    const facets = d(inA).departments as Array<{ id: string; count: number }>;
    const facetA = facets.find((facet) => facet.id === departmentA.id);
    const facetB = facets.find((facet) => facet.id === departmentB.id);
    expect(facetA?.count).toBe(2);
    // The facet deliberately ignores the selected department, so B stays visible.
    expect(facetB?.count).toBe(2);
  });

  it('treats user input as data, not SQL', async () => {
    const res = await search(`' OR 1=1; drop table projects; --`);
    expect(res.status).toBe(200);
    expect(Array.isArray(d(res).projects)).toBe(true);
  });
});

describe('projection and redaction', () => {
  it('returns only the whitelisted LibraryRow shape', async () => {
    const res = await request(app)
      .get('/api/v1/project-library')
      .query({ q: BODY_TOKEN })
      .set(auth(admin));

    const [row] = d(res).projects as Array<Record<string, unknown>>;
    expect(Object.keys(row).sort()).toEqual(
      [
        'createdAt',
        'department',
        'description',
        'excerpt',
        'id',
        'score',
        'session',
        'status',
        'student',
        'supervisors',
        'title',
        'updatedAt',
      ].sort(),
    );
    expect(Object.keys(row.student as object).sort()).toEqual(
      ['firstName', 'id', 'lastName'].sort(),
    );
    expect(Object.keys(row.department as object).sort()).toEqual(['code', 'id', 'name'].sort());

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(studentA1.email);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('<strong>');
  });

  it('does not leak a proposal body on a plain list read', async () => {
    const res = await request(app).get('/api/v1/project-library').query({ limit: 50 }).set(auth(admin));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(BODY_TOKEN);
  });

  it('contains no forbidden key anywhere in the response tree', async () => {
    const res = await request(app)
      .get('/api/v1/project-library')
      .query({ q: stamp })
      .set(auth(admin));
    expect(res.status).toBe(200);

    const forbidden = new Set([
      'attachment',
      'body',
      'email',
      'feedback',
      'milestone',
      'passwordHash',
      'proposalId',
      'registrationNumber',
      'review',
      'submission',
    ]);
    const found = new Set<string>();

    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (forbidden.has(key)) found.add(key);
          walk(child);
        }
      }
    };

    walk(res.body);
    expect([...found]).toEqual([]);
  });

  it('hydrates project-linked supervisors, primary first, history included', async () => {
    const res = await request(app)
      .get(`/api/v1/project-library/${projectAlpha}`)
      .set(auth(admin));

    expect(res.status).toBe(200);
    const supervisors = d(res).project.supervisors as Array<{ id: string }>;
    expect(supervisors.map((person) => person.id)).toEqual([supervisorA.id, supervisorA2.id]);
  });

  it('falls back to the student current supervisor when no row is linked', async () => {
    const res = await request(app)
      .get(`/api/v1/project-library/${projectBeta}`)
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect((d(res).project.supervisors as Array<{ id: string }>).map((p) => p.id)).toEqual([
      supervisorA2.id,
    ]);
  });
});

describe('detail and similarity', () => {
  it('returns the project plus similar rows, excluding itself', async () => {
    const res = await request(app)
      .get(`/api/v1/project-library/${projectAlpha}`)
      .set(auth(coordinatorB));

    expect(res.status).toBe(200);
    expect(d(res).project.id).toBe(projectAlpha);
    expect(d(res).project.session).toBe('2025/2026');

    const similar = d(res).similar as Array<{ id: string }>;
    expect(similar.map((row) => row.id)).not.toContain(projectAlpha);
    expect(similar.map((row) => row.id)).toContain(projectBeta);
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const unknown = await request(app)
      .get(`/api/v1/project-library/${randomUUID()}`)
      .set(auth(admin));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('RESOURCE_NOT_FOUND');

    const malformed = await request(app)
      .get('/api/v1/project-library/not-a-uuid')
      .set(auth(admin));
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('runs an advisory similarity check and honours excludeProjectId', async () => {
    const counts = async () =>
      (
        await db.execute(sql`
          select
            (select count(*) from projects)::int as projects,
            (select count(*) from proposals)::int as proposals
        `)
      ).rows[0] as { projects: number; proposals: number };
    const before = await counts();

    const base = {
      title: 'Photovoltaic scheduling ledger for campus energy',
      description: 'Matches solar generation to campus load with a shared ledger.',
    };

    const all = await request(app)
      .post('/api/v1/project-library/similarity-check')
      .set(auth(supervisorA))
      .send(base);
    expect(all.status).toBe(200);
    expect((d(all).matches as Array<{ id: string }>).map((row) => row.id)).toContain(projectAlpha);

    const excluded = await request(app)
      .post('/api/v1/project-library/similarity-check')
      .set(auth(supervisorA))
      .send({ ...base, excludeProjectId: projectAlpha });
    expect(excluded.status).toBe(200);
    expect(
      (d(excluded).matches as Array<{ id: string }>).map((row) => row.id),
    ).not.toContain(projectAlpha);

    const invalid = await request(app)
      .post('/api/v1/project-library/similarity-check')
      .set(auth(supervisorA))
      .send({ title: '   ', description: 'x' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    expect(await counts()).toEqual(before);
  });
});

describe('coordinator regression (ADR-17 unchanged)', () => {
  it('reads a foreign project through the library but not its workspace', async () => {
    const library = await request(app)
      .get(`/api/v1/project-library/${projectGamma}`)
      .set(auth(coordinatorA));
    expect(library.status).toBe(200);

    const show = await request(app)
      .get(`/api/v1/projects/${projectGamma}`)
      .set(auth(coordinatorA));
    expect(show.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/v1/projects/${projectGamma}`)
      .set(auth(coordinatorA))
      .send({ title: 'Nope' });
    expect(patch.status).toBe(404);

    const proposal = await request(app)
      .get(`/api/v1/proposals/${proposalGamma}`)
      .set(auth(coordinatorA));
    expect(proposal.status).toBe(404);
  });
});

describe('proposal similar-projects', () => {
  const url = (proposalId: string) => `/api/v1/proposals/${proposalId}/similar-projects`;

  it('allows an assigned supervisor, in-department coordinator and admin', async () => {
    for (const user of [supervisorA, coordinatorA, admin]) {
      const res = await request(app).get(url(proposalAlpha)).set(auth(user));
      expect(res.status, `${user.role} should read similar projects`).toBe(200);
      expect(res.body.data.matches).toBeInstanceOf(Array);
    }
  });

  it('refuses the proposal owner (403) and 404s a foreign coordinator', async () => {
    const owner = await request(app).get(url(proposalAlpha)).set(auth(studentA1));
    expect(owner.status).toBe(403);
    expect(owner.body.error.code).toBe('AUTHORIZATION_ERROR');

    const foreign = await request(app).get(url(proposalAlpha)).set(auth(coordinatorB));
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('excludes the proposal own approved project and respects the cap', async () => {
    const res = await request(app).get(url(proposalAlpha)).set(auth(admin));
    expect(res.status).toBe(200);

    const ids = (d(res).matches as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain(projectAlpha);
    expect(ids).toContain(projectBeta);

    const capped = await request(app)
      .get(url(proposalAlpha))
      .query({ limit: 1 })
      .set(auth(admin));
    expect((d(capped).matches as unknown[]).length).toBeLessThanOrEqual(1);
  });

  it('rejects an out-of-range limit', async () => {
    const res = await request(app)
      .get(url(proposalAlpha))
      .query({ limit: 11 })
      .set(auth(admin));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
