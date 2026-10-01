import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import { UPLOADS_ROOT } from '../../src/lib/storage.js';
import type { Role } from '../../src/lib/roles.js';
import {
  milestoneTemplates,
  milestones,
  notifications,
  reviews,
  supervisorAssignments,
  users,
} from '../../src/schema/index.js';

/**
 * Phase 3 integration suite (spec §5.4, §11.3, §13.3, §14, ADR-14).
 *
 * Drives the real Express app + real database through the whole proposal
 * lifecycle: the §5.4 approval transaction, the I1/I4/I13/I14 invariants,
 * the §11.3 document rule and 422 matrix, §13.3 student-scoped access,
 * §14 upload/download rules, and write-time sanitization.
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

const auth = (user: TestUser): { Authorization: string } => ({
  Authorization: `Bearer ${user.token}`,
});

const pdf = (): Buffer => Buffer.from('%PDF-1.4\nthesistrack integration fixture\n%%EOF');

/** Proposal ids this run created with documents — their upload dirs get cleaned. */
const trackedProposalIds = new Set<string>();

async function createProposalAs(user: TestUser, payload: Record<string, unknown>) {
  const res = await request(app).post('/api/v1/proposals').set(auth(user)).send(payload);
  if (res.status === 201) {
    trackedProposalIds.add(res.body.data.proposal.id);
  }
  return res;
}

let admin: TestUser;
let sup1: TestUser; // assigned to st1
let sup2: TestUser; // assigned to nobody
let st1: TestUser;
let st2: TestUser;
let st3: TestUser;
let st4: TestUser;
let st5: TestUser;
let st6: TestUser;
let st7: TestUser;
let st8: TestUser;
let st9: TestUser;
let st10: TestUser;

let defaultTemplate: { id: string; items: Array<{ title: string; dueOffsetDays: number }> };
let reviewTemplate: { id: string; items: Array<{ title: string; dueOffsetDays: number }> };
let emptyTemplate: { id: string };

beforeAll(async () => {
  admin = await createUser('administrator');
  sup1 = await createUser('supervisor');
  sup2 = await createUser('supervisor');
  [st1, st2, st3, st4, st5, st6, st7, st8, st9, st10] = await Promise.all(
    Array.from({ length: 10 }, () => createUser('student')),
  );

  // §5.4 precondition: the supervisor is assigned BEFORE the proposal exists
  // (ADR-12/ADR-13) — project_id stays NULL until approval back-fills it.
  await db.insert(supervisorAssignments).values({
    studentId: st1.id,
    supervisorId: sup1.id,
    isPrimary: true,
    assignedBy: admin.id,
  });

  // The seeded `Default` template (whatever the seed loaded) is the approval
  // fallback; read it exactly as the service does — oldest row by name.
  const existing = await db.query.milestoneTemplates.findFirst({
    where: eq(milestoneTemplates.name, 'Default'),
    orderBy: [asc(milestoneTemplates.createdAt), asc(milestoneTemplates.id)],
  });
  if (existing) {
    defaultTemplate = existing;
  } else {
    const [created] = await db
      .insert(milestoneTemplates)
      .values({
        name: 'Default',
        items: [{ title: 'Proposal approved', description: null, dueOffsetDays: 7 }],
      })
      .returning();
    defaultTemplate = created;
  }

  const [review] = await db
    .insert(milestoneTemplates)
    .values({
      name: `Integration review ${randomUUID().slice(0, 8)}`,
      items: [
        { title: 'Kickoff', description: 'Align scope', dueOffsetDays: 7 },
        { title: 'Draft chapter', description: null, dueOffsetDays: 21 },
        { title: 'Final submission', description: null, dueOffsetDays: 60 },
      ],
    })
    .returning();
  reviewTemplate = review;

  const [empty] = await db
    .insert(milestoneTemplates)
    .values({ name: `Integration empty ${randomUUID().slice(0, 8)}`, items: [] })
    .returning();
  emptyTemplate = empty;
});

afterAll(async () => {
  for (const id of trackedProposalIds) {
    fs.rmSync(path.join(UPLOADS_ROOT, 'proposals', id), { recursive: true, force: true });
  }
  await db.$client.end();
});

/* ========================================================================= */

describe('proposal lifecycle: draft → document → submit → review → approved (§5.4)', () => {
  let proposalId = '';
  let attachmentId = '';
  let traversalAttachmentId = '';

  it('creates the student’s draft at version 1', async () => {
    const res = await createProposalAs(st1, {
      title: 'A vision of queues',
      abstract: 'Rethinking priority queues for campus scheduling.',
      body: '<p>The full proposal body.</p>',
    });
    expect(res.status).toBe(201);
    expect(d(res).proposal).toMatchObject({
      status: 'draft',
      version: 1,
      projectId: null,
      studentId: st1.id,
      title: 'A vision of queues',
      body: '<p>The full proposal body.</p>',
    });
    expect(d(res).proposal.student).toMatchObject({ id: st1.id, role: 'student' });
    proposalId = d(res).proposal.id;
    trackedProposalIds.add(proposalId);
  });

  it('refuses a second in-flight proposal with 409 (I4)', async () => {
    const res = await createProposalAs(st1, { title: 'Another idea', abstract: 'Too many.' });
    expect(res.status).toBe(409);
    expect(e(res)).toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: 'You already have a proposal in progress',
    });
  });

  it('stores an upload under a server-derived name — traversal in the original name is inert (§14.4)', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1))
      .attach('file', pdf(), { filename: '../../../evil.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    const attachment = d(res).attachment;
    expect(attachment).toMatchObject({
      proposalId,
      proposalVersion: 1,
      mimeType: 'application/pdf',
      uploadedBy: st1.id,
      sizeBytes: pdf().length,
    });
    expect(attachment.originalFilename).toContain('evil.pdf'); // display only
    expect(attachment.storageKey).toBeUndefined(); // filesystem detail never leaks
    traversalAttachmentId = attachment.id;

    const dir = path.join(UPLOADS_ROOT, 'proposals', proposalId);
    const entries = fs.readdirSync(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^v1-[0-9a-f-]{36}\.pdf$/);
    expect(fs.existsSync(path.join(UPLOADS_ROOT, '..', 'evil.pdf'))).toBe(false);
  });

  it('lists the proposal’s documents', async () => {
    const res = await request(app)
      .get(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1));
    expect(res.status).toBe(200);
    expect(d(res).attachments.map((a: any) => a.id)).toEqual([traversalAttachmentId]);
  });

  it('lets the owner delete while draft, removing the bytes as well', async () => {
    const res = await request(app)
      .delete(`/api/v1/proposal-attachments/${traversalAttachmentId}`)
      .set(auth(st1));
    expect(res.status).toBe(200);
    expect(d(res).attachment.id).toBe(traversalAttachmentId);
    expect(fs.readdirSync(path.join(UPLOADS_ROOT, 'proposals', proposalId))).toHaveLength(0);
  });

  it('accepts the document of record', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1))
      .attach('file', pdf(), { filename: 'thesis.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(d(res).attachment).toMatchObject({
      originalFilename: 'thesis.pdf',
      proposalVersion: 1,
    });
    attachmentId = d(res).attachment.id;
  });

  it('submits: 201, version++, submitted_at set', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/submit`)
      .set(auth(st1));
    expect(res.status).toBe(201);
    expect(d(res).proposal).toMatchObject({ status: 'submitted', version: 2 });
    expect(d(res).proposal.submittedAt).toBeTruthy();
  });

  it('keeps the v1 attachment retrievable after version++ and streams §14.5 headers', async () => {
    const list = await request(app)
      .get(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1));
    expect(d(list).attachments).toHaveLength(1);

    const res = await request(app)
      .get(`/api/v1/proposal-attachments/${attachmentId}/download`)
      .set(auth(st1));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('filename="thesis.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(res.headers['content-length'])).toBe(pdf().length);
  });

  it('freezes the submitted version’s documents: DELETE → 422 (I14)', async () => {
    const res = await request(app)
      .delete(`/api/v1/proposal-attachments/${attachmentId}`)
      .set(auth(st1));
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details?.[0]?.path).toBe('status');

    const list = await request(app)
      .get(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1));
    expect(d(list).attachments).toHaveLength(1); // the row survived
  });

  it('answers 404 for an unknown proposal and 400 for a malformed one', async () => {
    // §9.4: validate(params) runs before the resource guard, so a malformed
    // id is refused as request shape (400 — the convention rbac.sh and
    // assignment.sh pin); the guard itself would answer 404 rather than let
    // Postgres see it (§13.5). A well-formed unknown id → 404.
    const unknown = await request(app)
      .get(`/api/v1/proposals/${randomUUID()}`)
      .set(auth(st1));
    expect(unknown.status).toBe(404);
    expect(e(unknown).code).toBe('RESOURCE_NOT_FOUND');
    const malformed = await request(app)
      .get('/api/v1/proposals/not-a-uuid')
      .set(auth(st1));
    expect(malformed.status).toBe(400);
    expect(e(malformed).code).toBe('VALIDATION_ERROR');
  });

  it('reads resolve through student_id: 403 for a stranger and an unassigned supervisor (§13.3)', async () => {
    const stranger = await request(app).get(`/api/v1/proposals/${proposalId}`).set(auth(st2));
    expect(stranger.status).toBe(403);
    expect(e(stranger).code).toBe('AUTHORIZATION_ERROR');

    const unassigned = await request(app)
      .get(`/api/v1/proposals/${proposalId}`)
      .set(auth(sup2));
    expect(unassigned.status).toBe(403);

    expect(
      (await request(app).get(`/api/v1/proposals/${proposalId}`).set(auth(st1))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/proposals/${proposalId}`).set(auth(sup1))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/proposals/${proposalId}`).set(auth(admin))).status,
    ).toBe(200);
  });

  it('download runs the same access matrix plus 404s', async () => {
    const url = `/api/v1/proposal-attachments/${attachmentId}/download`;
    expect((await request(app).get(url).set(auth(st2))).status).toBe(403);
    expect((await request(app).get(url).set(auth(sup2))).status).toBe(403);
    expect((await request(app).get(url).set(auth(sup1))).status).toBe(200);
    expect((await request(app).get(url).set(auth(admin))).status).toBe(200);
    expect(
      (await request(app)
        .get(`/api/v1/proposal-attachments/${randomUUID()}/download`)
        .set(auth(st1))).status,
    ).toBe(404);
    const malformed = await request(app)
      .get('/api/v1/proposal-attachments/nope/download')
      .set(auth(st1));
    expect(malformed.status).toBe(400); // validate(params), before the guard
  });

  it('moves submitted → under_review via the assigned supervisor', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/start-review`)
      .set(auth(sup1));
    expect(res.status).toBe(200);
    expect(d(res).proposal.status).toBe('under_review');
  });

  it('refuses further uploads while under_review (workflow, I14)', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1))
      .attach('file', pdf(), { filename: 'late.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('status');
  });

  it('refuses review decisions from the student and from an unassigned supervisor', async () => {
    const byStudent = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(st1))
      .send({ decision: 'approved' });
    expect(byStudent.status).toBe(403);

    const byUnassigned = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(sup2))
      .send({ decision: 'approved' });
    expect(byUnassigned.status).toBe(403);
  });

  it('requires a comment for revision_required (zod, 400)', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(sup1))
      .send({ decision: 'revision_required' });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details?.some((x) => x.path === 'comment')).toBe(true);
  });

  it('records a revision request: status change + append-only review row', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(sup1))
      .send({ decision: 'revision_required', comment: 'Tighten the scope section.' });
    expect(res.status).toBe(200);
    expect(d(res).proposal.status).toBe('revision_required');
    expect(d(res).review).toMatchObject({
      decision: 'revision_required',
      comment: 'Tighten the scope section.',
    });
    expect(d(res).review.reviewer).toMatchObject({ id: sup1.id, role: 'supervisor' });
    expect(d(res).project).toBeNull();

    const rows = await db.query.reviews.findMany({
      where: eq(reviews.proposalId, proposalId),
    });
    expect(rows).toHaveLength(1);
  });

  it('lets the student revise and upload under the NEW version (I14)', async () => {
    const patch = await request(app)
      .patch(`/api/v1/proposals/${proposalId}`)
      .set(auth(st1))
      .send({ title: 'A vision of queues (revised)' });
    expect(patch.status).toBe(200);
    expect(d(patch).proposal.title).toBe('A vision of queues (revised)');

    const upload = await request(app)
      .post(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1))
      .attach('file', pdf(), { filename: 'thesis-v2.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);
    expect(d(upload).attachment.proposalVersion).toBe(2);

    const list = await request(app)
      .get(`/api/v1/proposals/${proposalId}/attachments`)
      .set(auth(st1));
    expect(d(list).attachments.map((a: any) => a.proposalVersion)).toEqual([2, 1]); // v1 and v2 both retrievable
  });

  it('resubmits to version 3 and re-enters review', async () => {
    const submit = await request(app)
      .post(`/api/v1/proposals/${proposalId}/submit`)
      .set(auth(st1));
    expect(submit.status).toBe(201);
    expect(d(submit).proposal).toMatchObject({ status: 'submitted', version: 3 });

    const start = await request(app)
      .post(`/api/v1/proposals/${proposalId}/start-review`)
      .set(auth(sup1));
    expect(start.status).toBe(200);
    expect(d(start).proposal.status).toBe('under_review');
  });

  it('rejects an unknown templateId with 400 on path templateId', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(sup1))
      .send({ decision: 'approved', templateId: randomUUID() });
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
    expect(e(res).details?.[0]?.path).toBe('templateId');
  });

  it('approves in ONE transaction: project, back-fills, milestones, notifications, review row', async () => {
    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(sup1))
      .send({ decision: 'approved', templateId: reviewTemplate.id });
    expect(res.status).toBe(200);

    const { proposal, review, project } = d(res);
    expect(proposal).toMatchObject({ status: 'approved', projectId: project.id });
    expect(project).toMatchObject({
      status: 'active',
      studentId: st1.id,
      title: 'A vision of queues (revised)',
      description: 'Rethinking priority queues for campus scheduling.',
    });

    // step 3 — the pre-project assignment is back-filled with the new project
    const assignment = await db.query.supervisorAssignments.findFirst({
      where: and(
        eq(supervisorAssignments.studentId, st1.id),
        isNull(supervisorAssignments.endedAt),
      ),
    });
    expect(assignment?.projectId).toBe(project.id);

    // step 4 — milestones materialised from the explicit template
    const rows = await db.query.milestones.findMany({
      where: eq(milestones.projectId, project.id),
      orderBy: [asc(milestones.position)],
    });
    expect(rows.map((m) => m.title)).toEqual([
      'Kickoff',
      'Draft chapter',
      'Final submission',
    ]);
    const base = new Date(project.createdAt).getTime();
    rows.forEach((row, i) => {
      expect(row.dueAt?.getTime()).toBe(base + reviewTemplate.items[i].dueOffsetDays * 86_400_000);
      expect(row.status).toBe('pending');
    });

    // step 5 — notifications written with the change (§15.4): student + supervisor
    const forStudent = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, st1.id), eq(notifications.type, 'proposal')),
    });
    expect(forStudent.some((n) => n.resourceId === project.id)).toBe(true);
    const forSupervisor = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, sup1.id), eq(notifications.type, 'proposal')),
    });
    expect(forSupervisor.some((n) => n.resourceId === project.id)).toBe(true);

    // step 6 — the append-only review row exists (newest first, like GET)
    const rows2 = await db.query.reviews.findMany({
      where: eq(reviews.proposalId, proposalId),
      orderBy: [desc(reviews.createdAt), desc(reviews.id)],
    });
    expect(rows2.map((r) => r.decision)).toEqual(['approved', 'revision_required']);
    expect(review.reviewer).toMatchObject({ id: sup1.id });
  });

  it('exposes the review history, newest first (§11.3)', async () => {
    const res = await request(app)
      .get(`/api/v1/proposals/${proposalId}/reviews`)
      .set(auth(sup1));
    expect(res.status).toBe(200);
    expect(d(res).reviews.map((r: any) => r.decision)).toEqual([
      'approved',
      'revision_required',
    ]);
    for (const row of d(res).reviews) {
      expect(row.reviewer).toMatchObject({ role: 'supervisor' });
    }
  });

  it('the v1 attachment is still downloadable after approval (Phase 3 check)', async () => {
    // The Check's second half: approval materialises the project but must not
    // disturb the frozen document set — the original upload still streams.
    const res = await request(app)
      .get(`/api/v1/proposal-attachments/${attachmentId}/download`)
      .set(auth(sup1));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Number(res.headers['content-length'])).toBe(pdf().length);
  });

  let secondProposalId = '';

  it('releases the I4 slot after approval — but never a second active project (I1)', async () => {
    const create = await createProposalAs(st1, {
      title: 'Second project idea',
      abstract: 'Still curious about graphs.',
      body: '<p>More work.</p>',
    });
    expect(create.status).toBe(201);
    secondProposalId = d(create).proposal.id;

    const submit = await request(app)
      .post(`/api/v1/proposals/${secondProposalId}/submit`)
      .set(auth(st1));
    expect(submit.status).toBe(201);

    const start = await request(app)
      .post(`/api/v1/proposals/${secondProposalId}/start-review`)
      .set(auth(sup1));
    expect(start.status).toBe(200);

    const approve = await request(app)
      .post(`/api/v1/proposals/${secondProposalId}/review`)
      .set(auth(sup1))
      .send({ decision: 'approved' });
    expect(approve.status).toBe(409);
    expect(e(approve).message).toBe('This student already has an active project');

    // nothing moved: the proposal is still awaiting its decision
    const check = await request(app)
      .get(`/api/v1/proposals/${secondProposalId}`)
      .set(auth(st1));
    expect(d(check).proposal).toMatchObject({ status: 'under_review', projectId: null });
  });

  it('refuses edits to an approved proposal (illegal edge → 422)', async () => {
    const res = await request(app)
      .patch(`/api/v1/proposals/${proposalId}`)
      .set(auth(st1))
      .send({ title: 'Too late' });
    expect(res.status).toBe(422);
    expect(e(res).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(e(res).details?.[0]?.path).toBe('status');
  });
});

/* ========================================================================= */

describe('document content rule: at least one of body or attachments (§11.3)', () => {
  it('422 when the proposal has neither', async () => {
    const created = await createProposalAs(st3, {
      title: 'Bare proposal',
      abstract: 'Nothing written yet.',
    });
    expect(created.status).toBe(201);
    const id = d(created).proposal.id;

    const res = await request(app).post(`/api/v1/proposals/${id}/submit`).set(auth(st3));
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
      message: 'Add a document or write your proposal before submitting.',
    });
  });

  it('counts a body that sanitizes to nothing as empty', async () => {
    // st3's proposal is still draft; a script-only body must not satisfy the rule.
    const list = await request(app).get('/api/v1/proposals?limit=100').set(auth(st3));
    const mine = d(list).proposals.find((p: any) => p.title === 'Bare proposal');
    const patch = await request(app)
      .patch(`/api/v1/proposals/${mine.id}`)
      .set(auth(st3))
      .send({ body: '<script>alert(1)</script>' });
    expect(patch.status).toBe(200);
    expect(d(patch).proposal.body).toBeNull();

    const res = await request(app)
      .post(`/api/v1/proposals/${mine.id}/submit`)
      .set(auth(st3));
    expect(res.status).toBe(422);
  });

  it('201 with an editor body only', async () => {
    const created = await createProposalAs(st4, {
      title: 'Body only',
      abstract: 'Written in the browser.',
      body: '<p>Words, not files.</p>',
    });
    const id = d(created).proposal.id;
    const res = await request(app).post(`/api/v1/proposals/${id}/submit`).set(auth(st4));
    expect(res.status).toBe(201);
    expect(d(res).proposal.status).toBe('submitted');
  });

  it('201 with an attachment only', async () => {
    const created = await createProposalAs(st5, {
      title: 'Upload only',
      abstract: 'Written in Word.',
    });
    const id = d(created).proposal.id;
    const upload = await request(app)
      .post(`/api/v1/proposals/${id}/attachments`)
      .set(auth(st5))
      .attach('file', pdf(), { filename: 'proposal.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);

    const res = await request(app).post(`/api/v1/proposals/${id}/submit`).set(auth(st5));
    expect(res.status).toBe(201);
  });

  it('201 with both body and attachment', async () => {
    const created = await createProposalAs(st6, {
      title: 'Both',
      abstract: 'A summary plus the full document.',
      body: '<p>Short editor summary.</p>',
    });
    const id = d(created).proposal.id;
    const upload = await request(app)
      .post(`/api/v1/proposals/${id}/attachments`)
      .set(auth(st6))
      .attach('file', pdf(), { filename: 'full.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);

    const res = await request(app).post(`/api/v1/proposals/${id}/submit`).set(auth(st6));
    expect(res.status).toBe(201);
  });

  it('refuses a disallowed file type with 422 and writes nothing', async () => {
    const list = await request(app).get('/api/v1/proposals?limit=100').set(auth(st3));
    const mine = d(list).proposals.find((p: any) => p.title === 'Bare proposal');

    const res = await request(app)
      .post(`/api/v1/proposals/${mine.id}/attachments`)
      .set(auth(st3))
      .attach('file', Buffer.from('<h1>hi</h1>'), {
        filename: 'page.html',
        contentType: 'text/html',
      });
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
      message: 'File type not allowed',
    });

    const attachments = await request(app)
      .get(`/api/v1/proposals/${mine.id}/attachments`)
      .set(auth(st3));
    expect(d(attachments).attachments).toHaveLength(0);
    const dir = path.join(UPLOADS_ROOT, 'proposals', mine.id);
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toHaveLength(0);
  });

  it('refuses an attachment request with no file at all (400)', async () => {
    const list = await request(app).get('/api/v1/proposals?limit=100').set(auth(st3));
    const mine = d(list).proposals.find((p: any) => p.title === 'Bare proposal');
    const res = await request(app)
      .post(`/api/v1/proposals/${mine.id}/attachments`)
      .set(auth(st3));
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });
});

/* ========================================================================= */

describe('body sanitization on write (ADR-14)', () => {
  let proposalId = '';
  let storedBody = '';

  it('sanitizes on create: script/handlers/img die, safe markup survives', async () => {
    const res = await createProposalAs(st7, {
      title: 'Editor security',
      abstract: 'Stored XSS must not ship.',
      body: '<h2>Scope</h2><script>alert(1)</script><img src=x onerror=alert(1)><p onclick="evil()">Hello <a href="javascript:alert(1)">link</a></p>',
    });
    expect(res.status).toBe(201);
    proposalId = d(res).proposal.id;
    storedBody = d(res).proposal.body;

    expect(storedBody).not.toMatch(/<script/i);
    expect(storedBody).not.toMatch(/onerror/i);
    expect(storedBody).not.toMatch(/onclick/i);
    expect(storedBody).not.toMatch(/javascript:/i);
    expect(storedBody).not.toMatch(/<img/i);
    expect(storedBody).toContain('<h2>Scope</h2>');
    expect(storedBody).toContain('Hello');
    expect(storedBody).toContain('link');
  });

  it('GET returns exactly the stored string — no read-time re-render escape hatch', async () => {
    const res = await request(app)
      .get(`/api/v1/proposals/${proposalId}`)
      .set(auth(st7));
    expect(res.status).toBe(200);
    expect(d(res).proposal.body).toBe(storedBody);
  });

  it('preserves legitimate markup byte-for-byte on patch', async () => {
    const clean =
      '<h2>Title</h2><p>Plain <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li><li>two</li></ul>';
    const patch = await request(app)
      .patch(`/api/v1/proposals/${proposalId}`)
      .set(auth(st7))
      .send({ body: clean });
    expect(patch.status).toBe(200);
    expect(d(patch).proposal.body).toBe(clean);

    const reread = await request(app)
      .get(`/api/v1/proposals/${proposalId}`)
      .set(auth(st7));
    expect(d(reread).proposal.body).toBe(clean);
  });

  it('sanitizes on patch too — a textless result is stored as null', async () => {
    const patch = await request(app)
      .patch(`/api/v1/proposals/${proposalId}`)
      .set(auth(st7))
      .send({ body: '<script>alert(1)</script>' });
    expect(patch.status).toBe(200);
    expect(d(patch).proposal.body).toBeNull();
  });

  it('refuses an empty patch with 400 (at least one field)', async () => {
    const res = await request(app)
      .patch(`/api/v1/proposals/${proposalId}`)
      .set(auth(st7))
      .send({});
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });
});

/* ========================================================================= */

describe('workflow edges over HTTP (§13.1 layer 3)', () => {
  let proposalId = '';

  it('start-review on a draft → 422', async () => {
    const created = await createProposalAs(st8, {
      title: 'Edge cases',
      abstract: 'Workflow edges.',
      body: '<p>Content.</p>',
    });
    proposalId = d(created).proposal.id;

    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/start-review`)
      .set(auth(admin));
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('status');
  });

  it('review on submitted (skipping start-review) → 422', async () => {
    const submit = await request(app)
      .post(`/api/v1/proposals/${proposalId}/submit`)
      .set(auth(st8));
    expect(submit.status).toBe(201);

    const res = await request(app)
      .post(`/api/v1/proposals/${proposalId}/review`)
      .set(auth(admin))
      .send({ decision: 'approved' });
    expect(res.status).toBe(422);
  });

  it('a supervisor cannot edit a student’s draft (403 at the RBAC layer)', async () => {
    const res = await request(app)
      .patch(`/api/v1/proposals/${proposalId}`)
      .set(auth(sup1))
      .send({ title: 'Not mine' });
    expect(res.status).toBe(403);
  });

  it('an anonymous request never reaches a route (401)', async () => {
    const res = await request(app).get(`/api/v1/proposals/${proposalId}`);
    expect(res.status).toBe(401);
  });
});

/* ========================================================================= */

describe('§5.4 template resolution at approval', () => {
  it('falls back to the seeded Default template when no templateId is given', async () => {
    // st9 has no supervisor: the administrator runs the review side end-to-end.
    const created = await createProposalAs(st9, {
      title: 'Fallback approval',
      abstract: 'No explicit template.',
      body: '<p>Body.</p>',
    });
    const id = d(created).proposal.id;

    expect((await request(app).post(`/api/v1/proposals/${id}/submit`).set(auth(st9))).status).toBe(201);
    expect(
      (await request(app).post(`/api/v1/proposals/${id}/start-review`).set(auth(admin))).status,
    ).toBe(200);

    const approve = await request(app)
      .post(`/api/v1/proposals/${id}/review`)
      .set(auth(admin))
      .send({ decision: 'approved' });
    expect(approve.status).toBe(200);

    const project = d(approve).project;
    const rows = await db.query.milestones.findMany({
      where: eq(milestones.projectId, project.id),
    });
    expect(rows).toHaveLength(defaultTemplate.items.length);

    // no assignment exists for st9 — step 3 was a tolerated no-op
    const assignment = await db.query.supervisorAssignments.findFirst({
      where: eq(supervisorAssignments.studentId, st9.id),
    });
    expect(assignment).toBeUndefined();

    // …and the notification went to the student alone
    const notes = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, st9.id), eq(notifications.type, 'proposal')),
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].resourceId).toBe(project.id);
  });

  it('materialises zero milestones for an empty template — approval never fails on template data', async () => {
    const created = await createProposalAs(st10, {
      title: 'Empty template approval',
      abstract: 'Nothing to schedule.',
      body: '<p>Body.</p>',
    });
    const id = d(created).proposal.id;

    await request(app).post(`/api/v1/proposals/${id}/submit`).set(auth(st10));
    await request(app).post(`/api/v1/proposals/${id}/start-review`).set(auth(admin));

    const approve = await request(app)
      .post(`/api/v1/proposals/${id}/review`)
      .set(auth(admin))
      .send({ decision: 'approved', templateId: emptyTemplate.id });
    expect(approve.status).toBe(200);
    expect(d(approve).project.status).toBe('active');

    const rows = await db.query.milestones.findMany({
      where: eq(milestones.projectId, d(approve).project.id),
    });
    expect(rows).toHaveLength(0);
  });
});

/* ========================================================================= */

describe('GET /proposals scoping (§11.3)', () => {
  it('a student sees only their own proposals', async () => {
    const created = await createProposalAs(st2, {
      title: 'My scope test',
      abstract: 'Only mine.',
      body: '<p>Mine.</p>',
    });
    expect(created.status).toBe(201);
    const mineId = d(created).proposal.id;

    const res = await request(app).get('/api/v1/proposals?limit=100').set(auth(st2));
    expect(res.status).toBe(200);
    const ids = d(res).proposals.map((p: any) => p.id);
    expect(ids).toContain(mineId);
    expect(d(res).proposals.every((p: any) => p.studentId === st2.id)).toBe(true);
  });

  it('a supervisor sees their caseload only; an empty caseload sees nothing', async () => {
    const sup1List = await request(app).get('/api/v1/proposals?limit=100').set(auth(sup1));
    expect(sup1List.status).toBe(200);
    const students = new Set(d(sup1List).proposals.map((p: any) => p.studentId));
    expect(students).toEqual(new Set([st1.id]));

    const sup2List = await request(app).get('/api/v1/proposals?limit=100').set(auth(sup2));
    expect(sup2List.status).toBe(200);
    expect(d(sup2List).proposals).toHaveLength(0);
    expect(d(sup2List).pagination.total).toBe(0);
  });

  it('a student naming someone else’s studentId → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/proposals?studentId=${st1.id}`)
      .set(auth(st2));
    expect(res.status).toBe(403);
  });

  it('an administrator sees everyone and filters by studentId and status', async () => {
    const all = await request(app).get('/api/v1/proposals?limit=100').set(auth(admin));
    expect(all.status).toBe(200);
    expect(d(all).pagination.total).toBeGreaterThan(10);

    const forSt1 = await request(app)
      .get(`/api/v1/proposals?limit=100&studentId=${st1.id}`)
      .set(auth(admin));
    expect(d(forSt1).proposals.every((p: any) => p.studentId === st1.id)).toBe(true);

    const approved = await request(app)
      .get(`/api/v1/proposals?limit=100&studentId=${st1.id}&status=approved`)
      .set(auth(admin));
    expect(d(approved).proposals).toHaveLength(1);
    expect(d(approved).proposals[0].status).toBe('approved');
  });

  it('rejects an unknown status filter with 400', async () => {
    const res = await request(app)
      .get('/api/v1/proposals?status=bogus')
      .set(auth(admin));
    expect(res.status).toBe(400);
    expect(e(res).code).toBe('VALIDATION_ERROR');
  });
});
