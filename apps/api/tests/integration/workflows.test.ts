import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/lib/roles.js';
import {
  projectStages,
  proposals,
  reviews,
  submissions,
  supervisorAssignments,
  users,
  workflowStages,
  workflows,
} from '../../src/schema/index.js';

/**
 * Phase 4 integration suite — workflows / projects modules
 * (spec §3.4, §5.9, §11.2, §11.13, §11.14, ADR-15/ADR-16, I1/I15/I16/I17).
 *
 * Covers task 4.11's workflow half:
 *   - workflow CRUD rules (409 program conflict, 422 referenced delete,
 *     whole-set stage edit with server renumbering, archive semantics);
 *   - ADR-16 resolution order across all four paths, on BOTH project-creation
 *     paths (admin POST /projects and §5.4 approval);
 *   - advance gating — every `requires_*` unmet → 422 `unmet[]`, satisfied →
 *     completes + activates, final stage → zero active, `project.status`
 *     untouched, I16 double-active → 23505;
 *   - the ADR-15 snapshot-freeze proof;
 *   - `stage.started` / `stage.completed` in the §11.13 activity feed;
 *   - `GET /projects` scoping and the I1 conflict.
 *
 * Fixtures mint access tokens directly (same payload `signAccessToken`
 * produces) so the suite exercises authorization, not the login flow.
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

function tokenFor(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function createUser(role: Role, program?: string): Promise<TestUser> {
  const id = randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      email: `${role}-${id.slice(0, 8)}@integration.test`,
      firstName: 'Integration',
      lastName: id.slice(0, 8),
      role,
      program: program ?? null,
      isActive: true,
    })
    .returning();
  return { id: row.id, email: row.email, role, token: tokenFor(row) };
}

const auth = (user: TestUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.token}`,
});

/** §11.2 create — also the ADR-16 explicit-override path (branch 1). */
function createProjectAs(
  actor: TestUser,
  studentId: string,
  extra: Record<string, unknown> = {},
): Promise<request.Response> {
  return request(app)
    .post('/api/v1/projects')
    .set(auth(actor))
    .send({
      studentId,
      title: `Workflow integration project ${randomUUID().slice(0, 8)}`,
      description: 'Phase 4 workflow fixture',
      ...extra,
    });
}

const stagesOf = async (projectId: string) =>
  (
    await db.query.projectStages.findMany({
      where: eq(projectStages.projectId, projectId),
      orderBy: [asc(projectStages.position), asc(projectStages.id)],
    })
  ).map((row) => ({ id: row.id, position: row.position, status: row.status, name: row.name }));

const getStages = (actor: TestUser, projectId: string) =>
  request(app).get(`/api/v1/projects/${projectId}/stages`).set(auth(actor));

const advance = (actor: TestUser, projectId: string) =>
  request(app).post(`/api/v1/projects/${projectId}/stages/advance`).set(auth(actor));

/**
 * §8.10 — at least one ACTIVE default must exist for ADR-16 branch 3 to be
 * testable; the seed normally provides it, so this only repairs its absence.
 */
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
  await db.insert(workflowStages).values([
    { workflowId: created.id, position: 1, name: 'Default stage one' },
    { workflowId: created.id, position: 2, name: 'Default stage two' },
  ]);
  return created;
}

let admin: TestUser;
let sup: TestUser; // reads definitions; no assignments
let sup2: TestUser; // empty caseload, later assigned one project
let stOwner: TestUser; // scoping: own project only
let stAdvance: TestUser; // owns the gated advance-flow project
let stApproval: TestUser; // program-matched proposal approval

let defaultWorkflowId = '';
let wCRUD: any; // throwaway definition CRUD rules operate on
let wGated: any; // 3-stage gated workflow: approval + advance + freeze
let gatedProjectId = '';

const GATED_PROGRAM = `Gated Prog ${stamp}`;
const APPROVAL_PROGRAM = `Approval Prog ${stamp}`;

/** The §11.14 gate ladder used by both the approval and advance flows. */
const GATED_STAGES = [
  {
    name: 'Proposal approval',
    description: 'Gate on the approved proposal',
    dueOffsetDays: 7,
    responsibleRole: 'administrator',
    requiresApproval: true,
  },
  {
    name: 'Execution',
    description: 'Work happens here',
    dueOffsetDays: 30,
    responsibleRole: 'student',
    requiresSubmission: true,
    requiresReview: true,
  },
  { name: 'Defence', responsibleRole: 'supervisor' }, // ungated final stage
];

beforeAll(async () => {
  admin = await createUser('administrator');
  sup = await createUser('supervisor');
  sup2 = await createUser('supervisor');

  defaultWorkflowId = (await ensureDefaultWorkflow()).id;

  // The gated workflow: explicit-id project creation, the advance ladder, the
  // snapshot-freeze proof and the activity feed all hang off this one row.
  const res = await request(app)
    .post('/api/v1/workflows')
    .set(auth(admin))
    .send({ name: `Gated ${stamp}`, program: GATED_PROGRAM, stages: GATED_STAGES });
  expect(res.status).toBe(201);
  wGated = d(res);

  stAdvance = await createUser('student');
  const create = await createProjectAs(admin, stAdvance.id, { workflowId: wGated.workflow.id });
  expect(create.status).toBe(201);
  gatedProjectId = d(create).project.id;
});

afterAll(async () => {
  await db.$client.end();
});

/* ========================================================================= */

describe('workflow definition CRUD (§11.14)', () => {
  const PROG = `CRUD Prog ${stamp}`;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({
        name: `CRUD ${stamp}`,
        program: PROG,
        academicSession: '2026/2027',
        stages: [
          { name: 'One', requiresSubmission: true },
          { name: 'Two' },
          { name: 'Three' },
        ],
      });
    expect(res.status).toBe(201);
    wCRUD = d(res);
  });

  it('a student cannot read definitions (403); anonymous gets 401', async () => {
    const asStudent = await createUser('student');
    expect((await request(app).get('/api/v1/workflows').set(auth(asStudent))).status).toBe(403);
    expect((await request(app).get('/api/v1/workflows')).status).toBe(401);
  });

  it('a supervisor can read the definition list', async () => {
    const res = await request(app).get('/api/v1/workflows?limit=100').set(auth(sup));
    expect(res.status).toBe(200);
    expect(Array.isArray(d(res).workflows)).toBe(true);
    expect(d(res).workflows.some((w: any) => w.id === wCRUD.workflow.id)).toBe(true);
  });

  it('admin create renumbers positions 1..n (server-owned, contiguous)', async () => {
    expect(wCRUD.workflow).toMatchObject({
      name: `CRUD ${stamp}`,
      program: PROG,
      academicSession: '2026/2027',
      archivedAt: null,
      isDefault: false,
    });
    expect(wCRUD.stages.map((s: any) => s.position)).toEqual([1, 2, 3]);
    expect(wCRUD.stages.map((s: any) => s.name)).toEqual(['One', 'Two', 'Three']);
    expect(wCRUD.stages[0]).toMatchObject({
      requiresSubmission: true,
      requiresReview: false,
      requiresApproval: false,
    });
  });

  it('a second ACTIVE workflow for the same program is 409 — case-folded', async () => {
    const res = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({ name: `Duplicate ${stamp}`, program: PROG.toLowerCase(), stages: [] });
    expect(res.status).toBe(409);
    expect(e(res).code).toBe('RESOURCE_CONFLICT');
    expect(e(res).message).toBe(`Another active workflow already covers "${PROG.toLowerCase()}"`);
  });

  it('reads detail as supervisor; unknown → 404, malformed → 400, student → 403', async () => {
    const ok = await request(app).get(`/api/v1/workflows/${wCRUD.workflow.id}`).set(auth(sup));
    expect(ok.status).toBe(200);
    expect(d(ok).stages.map((s: any) => s.position)).toEqual([1, 2, 3]);

    const unknown = await request(app)
      .get(`/api/v1/workflows/${randomUUID()}`)
      .set(auth(sup));
    expect(unknown.status).toBe(404);

    const malformed = await request(app).get('/api/v1/workflows/nope').set(auth(sup));
    expect(malformed.status).toBe(400);
    expect(e(malformed).code).toBe('VALIDATION_ERROR');

    const asStudent = await createUser('student');
    expect(
      (await request(app).get(`/api/v1/workflows/${wCRUD.workflow.id}`).set(auth(asStudent)))
        .status,
    ).toBe(403);
  });

  it('PATCH {} is a 400 — an edit must name a field or stages[]', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${wCRUD.workflow.id}`)
      .set(auth(admin))
      .send({});
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });

  it('a stage id from ANOTHER workflow is a 400 on stages.N.id', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${wCRUD.workflow.id}`)
      .set(auth(admin))
      .send({ stages: [{ id: wGated.stages[0].id, name: 'Stolen' }] });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details?.[0]).toEqual({
      path: 'stages.0.id',
      message: 'Stage does not belong to this workflow',
    });
  });

  it('a duplicated stage id is a 400 on the second occurrence', async () => {
    const id = wCRUD.stages[0].id;
    const res = await request(app)
      .patch(`/api/v1/workflows/${wCRUD.workflow.id}`)
      .set(auth(admin))
      .send({ stages: [{ id, name: 'One' }, { id, name: 'One again' }, { name: 'Three' }] });
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]).toEqual({
      path: 'stages.1.id',
      message: 'Stage id appears more than once',
    });
  });

  it('whole-set edit reorders AND renumbers contiguous 1..n (FR-CW-02)', async () => {
    const ids = wCRUD.stages.map((s: any) => s.id);
    const res = await request(app)
      .patch(`/api/v1/workflows/${wCRUD.workflow.id}`)
      .set(auth(admin))
      .send({
        stages: [
          { id: ids[2], name: 'Three' },
          { id: ids[0], name: 'One', requiresApproval: true },
          { id: ids[1], name: 'Two' },
          { name: 'Four (new)' }, // appended definition — no id
        ],
      });
    expect(res.status).toBe(200);
    const rows = d(res).stages;
    expect(rows.map((s: any) => s.position)).toEqual([1, 2, 3, 4]);
    expect(rows.map((s: any) => s.name)).toEqual([
      'Three',
      'One',
      'Two',
      'Four (new)',
    ]);
    expect(rows[1]).toMatchObject({ requiresApproval: true, requiresSubmission: false });

    // Whole-set semantics: an omitted optional field means "none", not "keep".
    expect(rows[0]).toMatchObject({ requiresSubmission: false, requiresReview: false });
  });

  it('DELETE on an unreferenced definition is 200 and it 404s afterwards', async () => {
    const del = await request(app)
      .delete(`/api/v1/workflows/${wCRUD.workflow.id}`)
      .set(auth(admin));
    expect(del.status).toBe(200);
    expect(d(del).workflow.id).toBe(wCRUD.workflow.id);

    const again = await request(app)
      .get(`/api/v1/workflows/${wCRUD.workflow.id}`)
      .set(auth(admin));
    expect(again.status).toBe(404);
  });

  it('a non-administrator cannot create a definition (403 — §4.6)', async () => {
    const res = await request(app)
      .post('/api/v1/workflows')
      .set(auth(sup))
      .send({ name: `Nope ${stamp}`, stages: [] });
    expect(res.status).toBe(403);
    expect(e(res).code).toBe('AUTHORIZATION_ERROR');
  });
});

/* ========================================================================= */

describe('archive semantics: PATCH {archived} instead of DELETE (§11.14)', () => {
  const PROG = `Archive Prog ${stamp}`;
  let archivable: any;
  let slotTaker: any;

  it('archives a definition with PATCH {archived:true}', async () => {
    const create = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({ name: `Archivable ${stamp}`, program: PROG, stages: [{ name: 'A' }] });
    expect(create.status).toBe(201);
    archivable = d(create);

    const res = await request(app)
      .patch(`/api/v1/workflows/${archivable.workflow.id}`)
      .set(auth(admin))
      .send({ archived: true });
    expect(res.status).toBe(200);
    expect(d(res).workflow.archivedAt).toBeTruthy();
  });

  it('archived rows are hidden by default and visible with includeArchived', async () => {
    const hidden = await request(app)
      .get(`/api/v1/workflows?program=${encodeURIComponent(PROG)}&limit=100`)
      .set(auth(admin));
    expect(hidden.status).toBe(200);
    expect(d(hidden).workflows).toHaveLength(0);
    expect(d(hidden).pagination.total).toBe(0);

    const shown = await request(app)
      .get(
        `/api/v1/workflows?program=${encodeURIComponent(PROG)}&includeArchived=true&limit=100`,
      )
      .set(auth(admin));
    expect(shown.status).toBe(200);
    expect(d(shown).workflows.map((w: any) => w.id)).toContain(archivable.workflow.id);
  });

  it('archiving RELEASES the one-active-per-program slot (§8.10)', async () => {
    const res = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({ name: `Slot taker ${stamp}`, program: PROG, stages: [{ name: 'B' }] });
    expect(res.status).toBe(201);
    slotTaker = d(res);
  });

  it('un-archiving into a taken slot is 409 — the index would refuse it', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${archivable.workflow.id}`)
      .set(auth(admin))
      .send({ archived: false });
    expect(res.status).toBe(409);
    expect(e(res).message).toBe(`Another active workflow already covers "${PROG}"`);
    expect(d(await request(app).get(`/api/v1/workflows/${archivable.workflow.id}`).set(auth(admin))).workflow.archivedAt).toBeTruthy();
  });

  it('re-archiving an archived row keeps its original stamp', async () => {
    const first = await request(app)
      .patch(`/api/v1/workflows/${archivable.workflow.id}`)
      .set(auth(admin))
      .send({ archived: true });
    expect(first.status).toBe(200);
    const stampValue = d(first).workflow.archivedAt;

    const second = await request(app)
      .patch(`/api/v1/workflows/${archivable.workflow.id}`)
      .set(auth(admin))
      .send({ archived: true });
    expect(second.status).toBe(200);
    expect(d(second).workflow.archivedAt).toBe(stampValue);

    expect(slotTaker).toBeTruthy();
  });
});

/* ========================================================================= */

describe('ADR-16 resolution on POST /projects — four branches (§3.4)', () => {
  let explicitWorkflow: any;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({
        name: `Explicit ${stamp}`,
        program: `Explicit Prog ${stamp}`,
        stages: [{ name: 'E1' }, { name: 'E2' }],
      });
    expect(res.status).toBe(201);
    explicitWorkflow = d(res);
  });

  it('branch 1 — an explicit workflowId wins and materialises its stages', async () => {
    const student = await createUser('student', `Explicit Prog ${stamp}`);
    const res = await createProjectAs(admin, student.id, {
      workflowId: explicitWorkflow.workflow.id,
    });
    expect(res.status).toBe(201);
    const project = d(res).project;
    expect(project.workflowId).toBe(explicitWorkflow.workflow.id);

    const rows = await stagesOf(project.id);
    expect(rows.map((r) => r.name)).toEqual(['E1', 'E2']);
    expect(rows.map((r) => r.status)).toEqual(['active', 'pending']); // §5.9 stage 1
    expect(rows.map((r) => r.position)).toEqual([1, 2]);
  });

  it('branch 1 — an EXPLICIT unknown id is a 400 on path workflowId', async () => {
    const student = await createUser('student');
    const res = await createProjectAs(admin, student.id, { workflowId: randomUUID() });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details).toEqual([{ path: 'workflowId', message: 'Workflow not found' }]);
  });

  it('branch 2 — the student’s program matches, case-insensitively', async () => {
    const workflowProgram = `Program Match ${stamp}`;
    const created = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({
        name: `Program match ${stamp}`,
        program: workflowProgram,
        stages: [{ name: 'M1' }, { name: 'M2' }, { name: 'M3' }],
      });
    expect(created.status).toBe(201);
    const workflow = d(created);

    // The student's program differs in case — `lower()` must still match.
    const student = await createUser('student', workflowProgram.toLowerCase());
    const res = await createProjectAs(admin, student.id);
    expect(res.status).toBe(201);
    expect(d(res).project.workflowId).toBe(workflow.workflow.id);
    expect(await stagesOf(d(res).project.id)).toHaveLength(3);
  });

  it('branch 3 — no program match falls back to the flagged default', async () => {
    const student = await createUser('student', `Unmapped Program ${stamp}`);
    const res = await createProjectAs(admin, student.id);
    expect(res.status).toBe(201);
    expect(d(res).project.workflowId).toBe(defaultWorkflowId);
    expect((await stagesOf(d(res).project.id)).length).toBeGreaterThan(0);
  });

  it('branch 4 — no default at all yields ZERO stages, never a failure', async () => {
    const student = await createUser('student', `Unmapped 2 ${stamp}`);
    const archive = await request(app)
      .patch(`/api/v1/workflows/${defaultWorkflowId}`)
      .set(auth(admin))
      .send({ archived: true });
    expect(archive.status).toBe(200);

    try {
      const res = await createProjectAs(admin, student.id);
      expect(res.status).toBe(201);
      expect(d(res).project.workflowId).toBeNull();
      expect(await stagesOf(d(res).project.id)).toHaveLength(0);

      // The tracker is a legitimate 200 with no current stage (§3.4).
      const tracker = await getStages(admin, d(res).project.id);
      expect(tracker.status).toBe(200);
      expect(d(tracker)).toMatchObject({ stages: [], current: null });
    } finally {
      const restore = await request(app)
        .patch(`/api/v1/workflows/${defaultWorkflowId}`)
        .set(auth(admin))
        .send({ archived: false });
      expect(restore.status).toBe(200);
    }
  });

  it('I1 — a second active project for the same student is 409', async () => {
    const student = await createUser('student', `Unmapped 3 ${stamp}`);
    const first = await createProjectAs(admin, student.id);
    expect(first.status).toBe(201);

    const second = await createProjectAs(admin, student.id);
    expect(second.status).toBe(409);
    expect(e(second)).toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: 'This student already has an active project',
    });
  });

  it('an unknown studentId is a 400 on path studentId', async () => {
    const res = await createProjectAs(admin, randomUUID());
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('studentId');
  });
});

/* ========================================================================= */

describe('approval path: §5.4 step 5 snapshot + §5.9 auto-advance (4.10)', () => {
  let approvedProjectId = '';

  it('approving materialises the program-matched workflow with stage 1 auto-advanced', async () => {
    const created = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({
        name: `Approval flow ${stamp}`,
        program: APPROVAL_PROGRAM,
        stages: GATED_STAGES,
      });
    expect(created.status).toBe(201);
    const workflow = d(created);

    // Deliberate case difference: ADR-16 branch 2 must fold case.
    stApproval = await createUser('student', APPROVAL_PROGRAM.toLowerCase());
    const proposal = await request(app)
      .post('/api/v1/proposals')
      .set(auth(stApproval))
      .send({
        title: 'Approval seam thesis',
        abstract: 'Does §5.9 auto-advance run inside approval?',
        body: '<p>Body.</p>',
      });
    expect(proposal.status).toBe(201);
    const proposalId = d(proposal).proposal.id;

    expect(
      (await request(app).post(`/api/v1/proposals/${proposalId}/submit`).set(auth(stApproval)))
        .status,
    ).toBe(201);
    expect(
      (await request(app).post(`/api/v1/proposals/${proposalId}/start-review`).set(auth(admin)))
        .status,
    ).toBe(200);

    const approve = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(admin))
      .send({ decision: 'approved' });
    expect(approve.status).toBe(200);

    const project = d(approve).project;
    approvedProjectId = project.id;
    expect(project.workflowId).toBe(workflow.workflow.id);

    const rows = await stagesOf(project.id);
    expect(rows.map((r) => r.name)).toEqual(['Proposal approval', 'Execution', 'Defence']);
    // §5.9: stage 1 gated on approval AND satisfied by THIS approval → the
    // same transaction completed it and activated stage 2; stage 3 untouched.
    expect(rows.map((r) => r.status)).toEqual(['completed', 'active', 'pending']);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);

    const raw = await db.query.projectStages.findMany({
      where: eq(projectStages.projectId, project.id),
      orderBy: [asc(projectStages.position)],
    });
    expect(raw[0].completedBy).toBe(admin.id);
    expect(raw[0].completedAt).toBeTruthy();
    expect(raw[1].startedBy).toBe(admin.id);
    expect(raw[1].startedAt).toBeTruthy();
    expect(raw[2].startedAt).toBeNull();
    expect(raw[0]).toMatchObject({ requiresApproval: true, dueOffsetDays: 7 }); // snapshotted
  });

  it('an ungated stage 1 does NOT auto-advance — it stays the actor’s to move', async () => {
    const ungatedProgram = `Ungated Prog ${stamp}`;
    const created = await request(app)
      .post('/api/v1/workflows')
      .set(auth(admin))
      .send({
        name: `Ungated ${stamp}`,
        program: ungatedProgram,
        stages: [{ name: 'Free one' }, { name: 'Free two' }],
      });
    expect(created.status).toBe(201);

    const student = await createUser('student', ungatedProgram);
    const proposal = await request(app)
      .post('/api/v1/proposals')
      .set(auth(student))
      .send({ title: 'Ungated approval', abstract: 'Vacuous gates.', body: '<p>B.</p>' });
    expect(proposal.status).toBe(201);
    const proposalId = d(proposal).proposal.id;

    await request(app).post(`/api/v1/proposals/${proposalId}/submit`).set(auth(student));
    await request(app).post(`/api/v1/proposals/${proposalId}/start-review`).set(auth(admin));
    const approve = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(admin))
      .send({ decision: 'approved' });
    expect(approve.status).toBe(200);

    const rows = await stagesOf(d(approve).project.id);
    expect(rows.map((r) => r.status)).toEqual(['active', 'pending']);
  });
});

/* ========================================================================= */

describe('advance gating over HTTP (§11.14)', () => {
  it('the tracker reports the unmet gates without provoking a 422', async () => {
    const res = await getStages(admin, gatedProjectId);
    expect(res.status).toBe(200);
    expect(d(res).stages.map((s: any) => s.status)).toEqual(['active', 'pending', 'pending']);
    expect(d(res).current).toMatchObject({ position: 1, unmet: ['requires_approval'] });
    // §8.11 — deadline computed at read: started_at + due_offset_days.
    expect(new Date(d(res).current.dueAt).getTime()).toBe(
      new Date(d(res).current.startedAt).getTime() + 7 * 86_400_000,
    );
    expect(d(res).current.overdue).toBe(false);
  });

  it('RBAC: student 403, unassigned supervisor 403, anonymous 401', async () => {
    expect((await advance(stAdvance, gatedProjectId)).status).toBe(403);
    expect((await advance(sup2, gatedProjectId)).status).toBe(403);
    expect(
      (await request(app).post(`/api/v1/projects/${gatedProjectId}/stages/advance`)).status,
    ).toBe(401);
  });

  it('advance is 422 with details[].path = unmet while requires_approval is unmet', async () => {
    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).message).toBe('Cannot advance — requirements not met: requires_approval');
    expect(e(res).details).toEqual([{ path: 'unmet', message: 'requires_approval' }]);
    expect((await stagesOf(gatedProjectId)).map((s) => s.status)).toEqual([
      'active',
      'pending',
      'pending',
    ]);
  });

  it('an approved proposal satisfies requires_approval → advance completes stage 1', async () => {
    await db.insert(proposals).values({
      studentId: stAdvance.id,
      projectId: gatedProjectId,
      title: 'Approved proposal fixture',
      abstract: 'Direct row: the gate reads status, not provenance.',
      status: 'approved',
    });

    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(200);
    expect(d(res).stages.map((s: any) => s.status)).toEqual(['completed', 'active', 'pending']);
    expect(d(res).current).toMatchObject({
      position: 2,
      unmet: ['requires_submission', 'requires_review'],
    });
  });

  it('stage 2 with no submission yet reports BOTH gates unmet, in ladder order', async () => {
    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(422);
    expect(e(res).details).toEqual([
      { path: 'unmet', message: 'requires_submission' },
      { path: 'unmet', message: 'requires_review' },
    ]);
  });

  it('a submission inside the stage window leaves only requires_review', async () => {
    await db.insert(submissions).values({
      projectId: gatedProjectId,
      submittedBy: stAdvance.id,
      title: 'Chapter draft',
      createdAt: new Date(), // window: started_at ≤ created_at
    });

    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(422);
    expect(e(res).details).toEqual([{ path: 'unmet', message: 'requires_review' }]);
  });

  it('reviewing the submission satisfies the last gate → stage 3 activates', async () => {
    const [submission] = await db.query.submissions.findMany({
      where: eq(submissions.projectId, gatedProjectId),
      orderBy: [asc(submissions.createdAt)],
    });
    await db.insert(reviews).values({
      submissionId: submission.id,
      reviewerId: admin.id,
      decision: 'approved',
      comment: 'Looks good.',
    });

    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(200);
    expect(d(res).stages.map((s: any) => s.status)).toEqual([
      'completed',
      'completed',
      'active',
    ]);
    expect(d(res).current).toMatchObject({ position: 3, name: 'Defence', unmet: [] });
  });

  it('the ungated final stage advances freely, leaving ZERO active rows (I16)', async () => {
    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(200);
    expect(d(res).stages.map((s: any) => s.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(d(res).current).toBeNull();
    for (const row of d(res).stages) {
      expect(row.completedAt).toBeTruthy();
    }
  });

  it('a further advance is 409 — no active stage to advance', async () => {
    const res = await advance(admin, gatedProjectId);
    expect(res.status).toBe(409);
    expect(e(res)).toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: 'This project has no active stage to advance',
    });
  });

  it('project.status is untouched by any of it (§5.9)', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${gatedProjectId}`)
      .set(auth(admin));
    expect(res.status).toBe(200);
    expect(d(res).project).toMatchObject({ status: 'active', id: gatedProjectId });
  });
});

/* ========================================================================= */

describe('snapshot freeze: editing the workflow never moves live stages (ADR-15)', () => {
  let frozen: Array<{ id: string; position: number; status: string; name: string }> = [];

  beforeAll(async () => {
    frozen = await stagesOf(gatedProjectId);
    expect(frozen).toHaveLength(3);
  });

  it('editing + reordering + adding definition stages leaves project_stages byte-identical', async () => {
    const ids = (await getStages(admin, gatedProjectId)).body.data.stages.map(
      (s: any) => s.workflowStageId,
    );

    const res = await request(app)
      .patch(`/api/v1/workflows/${wGated.workflow.id}`)
      .set(auth(admin))
      .send({
        name: `Gated ${stamp} (edited)`,
        stages: [
          { id: ids[2], name: 'Defence (renamed)', dueOffsetDays: 3 },
          { id: ids[1], name: 'Execution (renamed)' },
          { id: ids[0], name: 'Proposal approval (renamed)' },
          { name: 'Appendix', requiresSubmission: true },
        ],
      });
    expect(res.status).toBe(200);
    expect(d(res).stages.map((s: any) => s.name)).toEqual([
      'Defence (renamed)',
      'Execution (renamed)',
      'Proposal approval (renamed)',
      'Appendix',
    ]);

    // The live snapshot did not move — not one field.
    expect(await stagesOf(gatedProjectId)).toEqual(frozen);

    const detail = await request(app)
      .get(`/api/v1/workflows/${wGated.workflow.id}`)
      .set(auth(admin));
    expect(detail.status).toBe(200);
    expect(d(detail).stages.map((s: any) => s.name)).toEqual([
      'Defence (renamed)',
      'Execution (renamed)',
      'Proposal approval (renamed)',
      'Appendix',
    ]);
  });

  it('omitting a MATERIALISED stage from the set is 422 on path stages', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${wGated.workflow.id}`)
      .set(auth(admin))
      .send({ stages: [{ name: 'Only one left' }, { name: 'Only two left' }] });
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details?.[0]?.path).toBe('stages');
    expect(e(res).details?.[0]?.message).toContain('frozen history');

    expect(await stagesOf(gatedProjectId)).toEqual(frozen);
  });

  it('DELETE on the referenced definition is 422 on path workflowId (I15)', async () => {
    const res = await request(app)
      .delete(`/api/v1/workflows/${wGated.workflow.id}`)
      .set(auth(admin));
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details).toEqual([
      {
        path: 'workflowId',
        message: 'Archive it instead — projects keep this definition as history',
      },
    ]);

    const still = await request(app)
      .get(`/api/v1/workflows/${wGated.workflow.id}`)
      .set(auth(admin));
    expect(still.status).toBe(200);
    expect(await stagesOf(gatedProjectId)).toEqual(frozen);
  });
});

/* ========================================================================= */

describe('activity feed carries the stage kinds (§11.13)', () => {
  it('includes stage.started and stage.completed with embedded actor names', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${gatedProjectId}/activity`)
      .set(auth(admin));
    expect(res.status).toBe(200);

    const events = d(res).activity;
    expect(events.length).toBeGreaterThan(0);

    const started = events.filter((ev: any) => ev.kind === 'stage.started');
    const completed = events.filter((ev: any) => ev.kind === 'stage.completed');
    expect(started.length).toBeGreaterThanOrEqual(2); // stage 1 at materialisation, stage 2 at advance
    expect(completed.length).toBeGreaterThanOrEqual(2);

    for (const ev of [...started, ...completed]) {
      expect(ev.summary).toMatch(/^Stage ".*" (started|completed)$/);
      expect(ev.actor).toMatchObject({ id: admin.id });
      expect(ev.actor.name).toMatch(/^Integration /);
    }

    // Newest first (merged feed).
    const times = events.map((ev: any) => new Date(ev.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

/* ========================================================================= */

describe('I16 — at most one active stage per project', () => {
  it('a direct double-active insert is refused by the index (23505)', async () => {
    // A fresh project, so its stage 1 is still `active` — the pre-condition a
    // double-active needs (the advance-flow project legitimately has zero).
    const student = await createUser('student');
    const create = await createProjectAs(admin, student.id, { workflowId: wGated.workflow.id });
    expect(create.status).toBe(201);
    const projectId = d(create).project.id;

    const [active] = await db.query.projectStages.findMany({
      where: eq(projectStages.projectId, projectId),
      limit: 1,
    });
    expect(active.status).toBe('active');

    let code: string | undefined;
    try {
      await db.insert(projectStages).values({
        projectId,
        workflowStageId: active.workflowStageId,
        position: 99, // free position — so only the ACTIVE index can fire
        status: 'active',
        name: 'Bogus second active stage',
        startedAt: new Date(),
        startedBy: admin.id,
      });
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe('23505');

    // The index held: exactly one active row remains.
    const actives = (await stagesOf(projectId)).filter((s) => s.status === 'active');
    expect(actives).toHaveLength(1);
  });
});

/* ========================================================================= */

describe('GET /projects scoping (§11.2)', () => {
  let caseloadProjectId = '';

  beforeAll(async () => {
    // Assignment FIRST, then the project — POST /projects back-fills the
    // assignment's project_id, which is what keys the supervisor's scope.
    const student = await createUser('student', `Caseload Prog ${stamp}`);
    await db.insert(supervisorAssignments).values({
      studentId: student.id,
      supervisorId: sup2.id,
      isPrimary: true,
      assignedBy: admin.id,
    });

    const res = await createProjectAs(admin, student.id);
    expect(res.status).toBe(201);
    caseloadProjectId = d(res).project.id;
  });

  it('a student sees only their own projects', async () => {
    const res = await request(app).get('/api/v1/projects?limit=100').set(auth(stAdvance));
    expect(res.status).toBe(200);
    const rows = d(res).projects;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((p: any) => p.studentId === stAdvance.id)).toBe(true);
    expect(rows.map((p: any) => p.id)).toContain(gatedProjectId);
  });

  it('an assigned supervisor sees the caseload; an empty caseload sees a blank page', async () => {
    const assigned = await request(app).get('/api/v1/projects?limit=100').set(auth(sup2));
    expect(assigned.status).toBe(200);
    expect(d(assigned).projects.map((p: any) => p.id)).toContain(caseloadProjectId);

    const empty = await request(app).get('/api/v1/projects?limit=100').set(auth(sup));
    expect(empty.status).toBe(200);
    expect(d(empty).projects).toHaveLength(0);
    expect(d(empty).pagination.total).toBe(0);
  });

  it('an administrator sees everything', async () => {
    const res = await request(app).get('/api/v1/projects?limit=100').set(auth(admin));
    expect(res.status).toBe(200);
    const ids = d(res).projects.map((p: any) => p.id);
    expect(ids).toContain(gatedProjectId);
    expect(ids).toContain(caseloadProjectId);
    expect(d(res).pagination.total).toBeGreaterThanOrEqual(ids.length);
  });

  it('the back-filled assignment keys supervisor access to the new project', async () => {
    const read = await request(app)
      .get(`/api/v1/projects/${caseloadProjectId}`)
      .set(auth(sup2));
    expect(read.status).toBe(200);
    expect(d(read).project.id).toBe(caseloadProjectId);

    // …and a different supervisor still gets 403 (§13.3).
    const denied = await request(app)
      .get(`/api/v1/projects/${caseloadProjectId}`)
      .set(auth(sup));
    expect(denied.status).toBe(403);
  });

  it('a status filter and an unknown status value behave as specified', async () => {
    const ok = await request(app)
      .get('/api/v1/projects?status=active&limit=100')
      .set(auth(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.data.projects.every((p: any) => p.status === 'active')).toBe(true);

    const bad = await request(app).get('/api/v1/projects?status=bogus').set(auth(admin));
    expect(bad.status).toBe(400);
    expect(e(bad).code).toBe('VALIDATION_ERROR');
  });
});

/* ========================================================================= */

describe('set default via PATCH (§16.3 builder "set default" — PROPOSED delta 2026-10-04)', () => {
  const PROG_A = `DefaultA Prog ${stamp}`;
  const PROG_B = `DefaultB Prog ${stamp}`;
  const PROG_C = `DefaultC Prog ${stamp}`;
  let wA: any;
  let wB: any;
  let wArchived: any;
  let originalDefaultId = '';

  const listHasDefault = async (id: string): Promise<boolean> => {
    const res = await request(app).get('/api/v1/workflows?limit=100').set(auth(admin));
    expect(res.status).toBe(200);
    return d(res).workflows.some((w: any) => w.id === id && w.isDefault === true);
  };

  beforeAll(async () => {
    originalDefaultId = defaultWorkflowId;
    for (const [slot, program] of [
      ['A', PROG_A],
      ['B', PROG_B],
      ['C', PROG_C],
    ] as const) {
      const res = await request(app)
        .post('/api/v1/workflows')
        .set(auth(admin))
        .send({ name: `SetDefault${slot} ${stamp}`, program, stages: [{ name: `${slot} one` }] });
      expect(res.status).toBe(201);
      if (slot === 'A') wA = d(res);
      if (slot === 'B') wB = d(res);
      if (slot === 'C') wArchived = d(res);
    }
    expect(wA.workflow.isDefault).toBe(false); // POST never steals the flag (§8.10)
  });

  afterAll(async () => {
    // Leave the fixtures repaired: the seed default is flagged again so the
    // ADR-16 branch-3 contract holds for every later run and file.
    const res = await request(app)
      .patch(`/api/v1/workflows/${originalDefaultId}`)
      .set(auth(admin))
      .send({ isDefault: true });
    expect(res.status).toBe(200);
  });

  it('PATCH {isDefault:true} flags this workflow and clears the old default in one write', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${wA.workflow.id}`)
      .set(auth(admin))
      .send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(d(res).workflow.isDefault).toBe(true);
    expect(await listHasDefault(wA.workflow.id)).toBe(true);
    expect(await listHasDefault(originalDefaultId)).toBe(false); // the previous holder moved off
  });

  it('the flag moves as a unit: the next set-default clears the previous holder', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${wB.workflow.id}`)
      .set(auth(admin))
      .send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(d(res).workflow.isDefault).toBe(true);
    expect(await listHasDefault(wA.workflow.id)).toBe(false);
    expect(await listHasDefault(wB.workflow.id)).toBe(true);
  });

  it('PATCH {isDefault:false} clears the flag — "no default" is a legal state (ADR-16 → zero stages)', async () => {
    const res = await request(app)
      .patch(`/api/v1/workflows/${wB.workflow.id}`)
      .set(auth(admin))
      .send({ isDefault: false });
    expect(res.status).toBe(200);
    expect(d(res).workflow.isDefault).toBe(false);
    expect(await listHasDefault(wB.workflow.id)).toBe(false);
  });

  it('an archived workflow cannot be set default — 422 on path isDefault, both shapes', async () => {
    const archive = await request(app)
      .patch(`/api/v1/workflows/${wArchived.workflow.id}`)
      .set(auth(admin))
      .send({ archived: true });
    expect(archive.status).toBe(200);

    const alone = await request(app)
      .patch(`/api/v1/workflows/${wArchived.workflow.id}`)
      .set(auth(admin))
      .send({ isDefault: true });
    expect(alone.status).toBe(422);
    expect(e(alone).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(alone).details).toEqual([
      { path: 'isDefault', message: 'Restore the workflow first, then set it as default' },
    ]);
    expect(await listHasDefault(wArchived.workflow.id)).toBe(false);

    // Same rule on an ACTIVE row asking to flip both flags at once.
    const combined = await request(app)
      .patch(`/api/v1/workflows/${wA.workflow.id}`)
      .set(auth(admin))
      .send({ archived: true, isDefault: true });
    expect(combined.status).toBe(422);
    expect(e(combined).details?.[0]?.path).toBe('isDefault');
    expect(d(await request(app).get(`/api/v1/workflows/${wA.workflow.id}`).set(auth(admin))).workflow.archivedAt).toBeNull();
  });

  it('archiving the default workflow releases the flag (§8.10 partial index scope)', async () => {
    const set = await request(app)
      .patch(`/api/v1/workflows/${wA.workflow.id}`)
      .set(auth(admin))
      .send({ isDefault: true });
    expect(set.status).toBe(200);
    expect(d(set).workflow.isDefault).toBe(true);

    const archive = await request(app)
      .patch(`/api/v1/workflows/${wA.workflow.id}`)
      .set(auth(admin))
      .send({ archived: true });
    expect(archive.status).toBe(200);
    expect(d(archive).workflow.isDefault).toBe(false);
    expect(await listHasDefault(wA.workflow.id)).toBe(false);
  });
});
