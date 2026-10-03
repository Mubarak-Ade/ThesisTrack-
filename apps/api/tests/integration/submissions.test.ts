import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';

import app from '../../src/app.js';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';
import { UPLOADS_ROOT } from '../../src/lib/storage.js';
import type { Role } from '../../src/lib/roles.js';
import { milestones, submissionVersions, submissions, users } from '../../src/schema/index.js';
import * as submissionRepo from '../../src/modules/submissions/repository.js';

/**
 * Phase 5 integration suite (spec §5.5, §11.5, §13.3, §13.5, §14).
 *
 * Drives the real Express app + real database through the submission
 * lifecycle: text and file submissions, §14.4 upload rules (size, MIME, path
 * traversal), §14.5 download headers and authz, §5.5 state machine over HTTP,
 * I7 version immutability, and §14.6 draft deletion with its bytes.
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

const pdf = (): Buffer => Buffer.from('%PDF-1.4\nthesistrack submission fixture\n%%EOF');

/** Projects this run created — their `uploads/<projectId>/` dirs get cleaned. */
const trackedProjectIds = new Set<string>();

async function createSubmission(
  user: TestUser,
  payload: Record<string, unknown>,
): Promise<request.Response> {
  return request(app).post('/api/v1/submissions').set(auth(user)).send({ projectId, ...payload });
}

let admin: TestUser;
let sup1: TestUser; // assigned to st1
let sup2: TestUser; // assigned to nobody
let st1: TestUser;
let st2: TestUser;

let projectId: string;
let milestoneA: { id: string };
let milestoneB: { id: string };

/** A submission whose content is a file, and its stored version row. */
let fileSubmissionId = '';
let fileVersionId = '';

beforeAll(async () => {
  admin = await createUser('administrator');
  sup1 = await createUser('supervisor');
  sup2 = await createUser('supervisor');
  st1 = await createUser('student');
  st2 = await createUser('student');

  // Assignment BEFORE the project exists (ADR-12/ADR-13); the admin project
  // flow back-fills `project_id`, which is what makes sup1 a participant.
  const assigned = await request(app)
    .post(`/api/v1/students/${st1.id}/supervisor`)
    .set(auth(admin))
    .send({ supervisorId: sup1.id });
  expect(assigned.status).toBe(201);

  const project = await request(app)
    .post('/api/v1/projects')
    .set(auth(admin))
    .send({
      studentId: st1.id,
      title: 'Phase 5 — submissions',
      description: 'Integration fixture for the submissions module.',
    });
  expect(project.status).toBe(201);
  projectId = d(project).project.id;
  trackedProjectIds.add(projectId);

  const [a, b] = await db
    .insert(milestones)
    .values([
      { projectId, title: 'Chapter 1', position: 0, dueAt: new Date(Date.now() + 604_800_000) },
      { projectId, title: 'Chapter 2', position: 1, dueAt: new Date(Date.now() + 1_209_600_000) },
    ])
    .returning();
  milestoneA = a;
  milestoneB = b;
});

afterAll(async () => {
  for (const id of trackedProjectIds) {
    fs.rmSync(path.join(UPLOADS_ROOT, id), { recursive: true, force: true });
  }
  await db.$client.end();
});

/* ========================================================================= */

describe('text-only submission: create → version 1 → submit (§5.5, §14.2)', () => {
  let submissionId = '';

  it('creates a draft whose JSON body becomes version 1', async () => {
    const res = await createSubmission(st1, {
      title: 'Literature review',
      body: '<p>Chapter one, first draft.</p>',
      milestoneId: milestoneA.id,
    });
    expect(res.status).toBe(201);
    expect(d(res).submission).toMatchObject({
      projectId,
      milestoneId: milestoneA.id,
      submittedBy: st1.id,
      title: 'Literature review',
      status: 'draft',
      submittedAt: null,
    });
    expect(d(res).submission.submitter).toMatchObject({ id: st1.id, role: 'student' });
    submissionId = d(res).submission.id;

    const versions = await request(app)
      .get(`/api/v1/submissions/${submissionId}/versions`)
      .set(auth(st1));
    expect(versions.status).toBe(200);
    expect(d(versions).versions).toHaveLength(1);
    const version = d(versions).versions[0];
    expect(version).toMatchObject({
      versionNumber: 1,
      body: '<p>Chapter one, first draft.</p>',
      originalFilename: null,
    });
    // §14.3: the storage key is server-side and never leaves the API.
    expect('storageKey' in version).toBe(false);
  });

  it('sanitizes the body on write (ADR-14 applied to submissions)', async () => {
    const res = await createSubmission(st1, {
      title: 'XSS probe',
      body: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>',
    });
    expect(res.status).toBe(201);
    const id = d(res).submission.id;

    const detail = await request(app).get(`/api/v1/submissions/${id}`).set(auth(st1));
    const version = await request(app)
      .get(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1));
    expect(d(version).versions[0].body).not.toContain('script');
    expect(d(version).versions[0].body).not.toContain('onerror');
    expect(d(version).versions[0].body).toContain('<p>ok</p>');
    expect(d(detail).submission.title).toBe('XSS probe');
  });

  it('submits without creating a second version', async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/submit`)
      .set(auth(st1));
    expect(res.status).toBe(201);
    expect(d(res).submission).toMatchObject({ status: 'submitted' });
    expect(d(res).submission.submittedAt).not.toBeNull();

    const versions = await request(app)
      .get(`/api/v1/submissions/${submissionId}/versions`)
      .set(auth(st1));
    expect(d(versions).versions).toHaveLength(1);
  });

  it('creates version 1 when a bare draft is submitted (§5.5)', async () => {
    const created = await createSubmission(st1, { title: 'Bare draft' });
    expect(created.status).toBe(201);
    const id = d(created).submission.id;

    const before = await request(app)
      .get(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1));
    expect(d(before).versions).toHaveLength(0);

    const res = await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(st1));
    expect(res.status).toBe(201);
    expect(d(res).submission.status).toBe('submitted');

    const after = await request(app).get(`/api/v1/submissions/${id}/versions`).set(auth(st1));
    expect(d(after).versions).toHaveLength(1);
    expect(d(after).versions[0]).toMatchObject({ versionNumber: 1, body: '' });
  });
});

/* ========================================================================= */

describe('file submission: upload, traversal, size, MIME (§14)', () => {
  it('accepts a multipart file at create and records the §14.4 trio', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .field('projectId', projectId)
      .field('title', 'Dataset handover')
      .field('milestoneId', milestoneB.id)
      .attach('file', pdf(), { filename: 'dataset.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(d(res).submission).toMatchObject({ status: 'draft', milestoneId: milestoneB.id });
    fileSubmissionId = d(res).submission.id;

    const versions = await request(app)
      .get(`/api/v1/submissions/${fileSubmissionId}/versions`)
      .set(auth(st1));
    const version = d(versions).versions[0];
    expect(version).toMatchObject({
      versionNumber: 1,
      originalFilename: 'dataset.pdf',
      mimeType: 'application/pdf',
      sizeBytes: expect.any(Number),
      body: null,
    });
    fileVersionId = version.id;

    const [row] = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.id, fileVersionId));
    expect(row.storageKey).toMatch(
      new RegExp(`^${projectId}/${fileSubmissionId}/v1-[0-9a-f-]{36}\\.pdf$`),
    );
  });

  it('streams the download with exactly the §14.5 headers', async () => {
    const res = await request(app)
      .get(`/api/v1/submission-versions/${fileVersionId}/download`)
      .set(auth(st1));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe(String(pdf().length));
    expect(res.headers['content-disposition']).toContain('attachment;');
    expect(res.headers['content-disposition']).toContain('filename="dataset.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.length).toBe(pdf().length);
  });

  it('never lets a client filename reach the filesystem (§14.4)', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .field('projectId', projectId)
      .field('title', 'Traversal probe')
      .attach('file', pdf(), { filename: '../../../evil.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    const id = d(res).submission.id;

    const versions = await request(app)
      .get(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1));
    const stored = d(versions).versions[0];
    // multer's `preservePath` default strips directory components before the
    // name is even stored, so the display name degrades to `evil.pdf` — and
    // either way it is never used as a path.
    expect(stored.originalFilename).not.toContain('..');

    const dir = path.join(UPLOADS_ROOT, projectId, id);
    expect(fs.readdirSync(dir)).toEqual([expect.stringMatching(/^v1-[0-9a-f-]{36}\.pdf$/)]);
    expect(fs.existsSync(path.join(UPLOADS_ROOT, '..', 'evil.pdf'))).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_ROOT, 'evil.pdf'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '..', '..', '..', 'evil.pdf'))).toBe(false);
  });

  it('refuses an oversize file with 422 (UPLOAD_MAX_BYTES)', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .field('projectId', projectId)
      .field('title', 'Oversize')
      .attach('file', Buffer.alloc(env.UPLOAD_MAX_BYTES + 1024), {
        filename: 'huge.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    expect(e(res).message).toContain('maximum upload size');
  });

  it('refuses a MIME type outside the allow-list with 422', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .field('projectId', projectId)
      .field('title', 'Bad MIME')
      .attach('file', Buffer.from('MZ'), {
        filename: 'setup.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({ code: 'BUSINESS_RULE_VIOLATION', message: 'File type not allowed' });
    expect(e(res).details?.[0]?.path).toBe('file');
  });
});

/* ========================================================================= */

describe('download authorization matrix (§14.5, §13.3, §13.5)', () => {
  const download = (user: TestUser, versionId = fileVersionId) =>
    request(app).get(`/api/v1/submission-versions/${versionId}/download`).set(auth(user));

  it('allows the owning student', async () => {
    expect((await download(st1)).status).toBe(200);
  });

  it('allows the assigned supervisor', async () => {
    expect((await download(sup1)).status).toBe(200);
  });

  it('allows an administrator', async () => {
    expect((await download(admin)).status).toBe(200);
  });

  it('refuses another student with 403', async () => {
    const res = await download(st2);
    expect(res.status).toBe(403);
    expect(e(res)).toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('refuses an unassigned supervisor with 403', async () => {
    expect((await download(sup2)).status).toBe(403);
  });

  it('answers 404 for an id that does not exist', async () => {
    const res = await download(st1, randomUUID());
    expect(res.status).toBe(404);
    expect(e(res)).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('answers 400 for a malformed id (§9.4 validate-first convention)', async () => {
    const res = await download(st1, 'not-a-uuid');
    expect(res.status).toBe(400);
    expect(e(res)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('404s a text-only version: it exists, but has no bytes (§14.2)', async () => {
    const created = await createSubmission(st1, { title: 'Text only', body: '<p>words</p>' });
    const id = d(created).submission.id;
    const versions = await request(app)
      .get(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1));
    const res = await download(st1, d(versions).versions[0].id);
    expect(res.status).toBe(404);
    expect(e(res)).toMatchObject({ message: 'File not found' });
  });
});

/* ========================================================================= */

describe('append version and immutability (§5.5, I7)', () => {
  let draftId = '';
  let draftVersionId = '';

  it('appends to a draft without submitting it (§5.5 optional attach step)', async () => {
    const created = await createSubmission(st1, { title: 'Two-part handover' });
    draftId = d(created).submission.id;

    const res = await request(app)
      .post(`/api/v1/submissions/${draftId}/versions`)
      .set(auth(st1))
      .attach('file', pdf(), { filename: 'part-one.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(d(res).submission).toMatchObject({ status: 'draft' });
    expect(d(res).version).toMatchObject({ versionNumber: 1, originalFilename: 'part-one.pdf' });
    draftVersionId = d(res).version.id;

    // …and the draft still submits afterwards (the diagram's next line).
    const submitted = await request(app)
      .post(`/api/v1/submissions/${draftId}/submit`)
      .set(auth(st1));
    expect(submitted.status).toBe(201);
    expect(d(submitted).submission.status).toBe('submitted');
  });

  it('refuses a request carrying both a file and a body', async () => {
    const created = await createSubmission(st1, { title: 'Both halves' });
    const id = d(created).submission.id;
    const res = await request(app)
      .post(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1))
      .field('body', '<p>text</p>')
      .attach('file', pdf(), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('file');
  });

  it('refuses a request carrying neither a file nor a body', async () => {
    const created = await createSubmission(st1, { title: 'No halves' });
    const id = d(created).submission.id;
    const res = await request(app)
      .post(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1))
      .send({});
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('file');
  });

  it('leaves version 1 byte-identical when version 2 is appended (I7)', async () => {
    const before = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.id, draftVersionId));

    // revision_required → append → submitted, version 2 (§5.5 revision arrow).
    await db
      .update(submissions)
      .set({ status: 'revision_required' })
      .where(eq(submissions.id, draftId));

    const res = await request(app)
      .post(`/api/v1/submissions/${draftId}/versions`)
      .set(auth(st1))
      .send({ body: '<p>Revised chapter.</p>' });
    expect(res.status).toBe(201);
    expect(d(res).submission).toMatchObject({ status: 'submitted' });
    expect(d(res).submission.submittedAt).not.toBeNull();
    expect(d(res).version).toMatchObject({ versionNumber: 2, body: '<p>Revised chapter.</p>' });

    const after = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.id, draftVersionId));
    expect(after).toEqual(before);
  });

  it('exposes no update or delete route for a version (I7)', async () => {
    const paths = [
      `/api/v1/submission-versions/${draftVersionId}`,
      `/api/v1/submission-versions/${draftVersionId}/download`,
      `/api/v1/submissions/${draftId}/versions/${draftVersionId}`,
    ];
    for (const p of paths) {
      for (const method of ['patch', 'put'] as const) {
        const res = await request(app)[method](p).set(auth(st1)).send({ body: 'hacked' });
        // `/download` is GET-only; every other path has no route at all.
        expect(res.status).toBe(404);
      }
    }

    const deleted = await request(app)
      .delete(`/api/v1/submissions/${draftId}/versions/${draftVersionId}`)
      .set(auth(st1));
    expect(deleted.status).toBe(404);
  });

  it('exports no update/delete path for versions from the repository (I7)', () => {
    const names = Object.keys(submissionRepo);
    expect(names).toContain('insertVersion'); // the only write that exists
    expect(names.filter((n) => /^(update|delete|patch|remove).*[Vv]ersion/i.test(n))).toEqual([]);
    expect(names.filter((n) => /version/i.test(n)).sort()).toEqual(
      [
        'countVersions',
        'findVersionById',
        'findVersionWithSubmission',
        'insertVersion',
        'listVersions',
        'nextVersionNumber',
      ].sort(),
    );
  });

  it('refuses PATCH body once a version exists (I7 — insert, never update)', async () => {
    const created = await createSubmission(st1, { title: 'Already versioned', body: '<p>v1</p>' });
    const id = d(created).submission.id;

    const res = await request(app)
      .patch(`/api/v1/submissions/${id}`)
      .set(auth(st1))
      .send({ body: '<p>try again</p>' });
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    expect(e(res).details?.[0]?.path).toBe('body');
  });

  it('accepts PATCH body on a versionless draft and makes it version 1', async () => {
    const created = await createSubmission(st1, { title: 'Written later' });
    const id = d(created).submission.id;

    const res = await request(app)
      .patch(`/api/v1/submissions/${id}`)
      .set(auth(st1))
      .send({ title: 'Written later, renamed', body: '<p>Typed after creation.</p>' });
    expect(res.status).toBe(200);
    expect(d(res).submission).toMatchObject({ title: 'Written later, renamed', status: 'draft' });

    const versions = await request(app)
      .get(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1));
    expect(d(versions).versions).toHaveLength(1);
    expect(d(versions).versions[0].body).toBe('<p>Typed after creation.</p>');
  });
});

/* ========================================================================= */

describe('state machine over HTTP (§5.5, §11.5)', () => {
  it('patches a draft', async () => {
    const created = await createSubmission(st1, { title: 'Old title' });
    const id = d(created).submission.id;
    const res = await request(app)
      .patch(`/api/v1/submissions/${id}`)
      .set(auth(st1))
      .send({ title: 'New title', milestoneId: milestoneA.id });
    expect(res.status).toBe(200);
    expect(d(res).submission).toMatchObject({ title: 'New title', milestoneId: milestoneA.id });
  });

  it('refuses PATCH after submit (422, status named)', async () => {
    const created = await createSubmission(st1, { title: 'Frozen on submit' });
    const id = d(created).submission.id;
    await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(st1));

    const res = await request(app)
      .patch(`/api/v1/submissions/${id}`)
      .set(auth(st1))
      .send({ title: 'Sneaky edit' });
    expect(res.status).toBe(422);
    expect(e(res)).toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
    expect(e(res).details?.[0]?.path).toBe('status');
  });

  it('refuses append on an already submitted submission (§5.5 shows no such edge)', async () => {
    const created = await createSubmission(st1, { title: 'Awaiting review', body: '<p>v1</p>' });
    const id = d(created).submission.id;
    await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(st1));

    const res = await request(app)
      .post(`/api/v1/submissions/${id}/versions`)
      .set(auth(st1))
      .attach('file', pdf(), { filename: 'late.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('status');
  });

  it('refuses submit from revision_required — the loop appends a version instead', async () => {
    const created = await createSubmission(st1, { title: 'Back for revision', body: '<p>v1</p>' });
    const id = d(created).submission.id;
    await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(st1));
    await db.update(submissions).set({ status: 'revision_required' }).where(eq(submissions.id, id));

    const res = await request(app)
      .post(`/api/v1/submissions/${id}/submit`)
      .set(auth(st1));
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('status');
  });

  it('deletes a draft and takes its files with it (§14.6)', async () => {
    const created = await request(app)
      .post('/api/v1/submissions')
      .set(auth(st1))
      .field('projectId', projectId)
      .field('title', 'Disposable draft')
      .attach('file', pdf(), { filename: 'scratch.pdf', contentType: 'application/pdf' });
    expect(created.status).toBe(201);
    const id = d(created).submission.id;
    const dir = path.join(UPLOADS_ROOT, projectId, id);
    expect(fs.existsSync(dir)).toBe(true);

    const res = await request(app).delete(`/api/v1/submissions/${id}`).set(auth(st1));
    expect(res.status).toBe(200);
    expect(d(res).submission).toMatchObject({ id, status: 'draft' });

    const rows = await db.select().from(submissions).where(eq(submissions.id, id));
    expect(rows).toHaveLength(0);
    const versions = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.submissionId, id));
    expect(versions).toHaveLength(0);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('refuses to delete anything that is no longer a draft', async () => {
    const created = await createSubmission(st1, { title: 'Kept submission', body: '<p>v1</p>' });
    const id = d(created).submission.id;
    await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(st1));

    const res = await request(app).delete(`/api/v1/submissions/${id}`).set(auth(st1));
    expect(res.status).toBe(422);
    expect(e(res).details?.[0]?.path).toBe('status');
  });

  it('lets the assigned supervisor read but never write (§4.5)', async () => {
    const created = await createSubmission(st1, { title: 'Supervised read' });
    const id = d(created).submission.id;

    expect((await request(app).get(`/api/v1/submissions/${id}`).set(auth(sup1))).status).toBe(200);

    const write = await request(app)
      .patch(`/api/v1/submissions/${id}`)
      .set(auth(sup1))
      .send({ title: 'Supervisor edit' });
    expect(write.status).toBe(403);
    expect(e(write)).toMatchObject({ code: 'AUTHORIZATION_ERROR' });

    expect(
      (await request(app).post(`/api/v1/submissions/${id}/submit`).set(auth(sup1))).status,
    ).toBe(403);
    expect((await request(app).delete(`/api/v1/submissions/${id}`).set(auth(sup1))).status).toBe(403);
  });

  it('keeps submission authorship with the student — no admin/supervisor create (§4.5)', async () => {
    for (const user of [admin, sup1]) {
      const res = await request(app)
        .post('/api/v1/submissions')
        .set(auth(user))
        .send({ projectId, title: 'Not mine to submit' });
      expect(res.status).toBe(403);
      expect(e(res)).toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    }
  });

  it('refuses a student creating for someone else’s project (403)', async () => {
    const res = await createSubmission(st2, { title: 'Cross-project probe' });
    expect(res.status).toBe(403);
  });

  it('refuses an unknown milestone (400, path milestoneId)', async () => {
    const res = await createSubmission(st1, {
      title: 'Bad milestone',
      milestoneId: randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(e(res)).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(e(res).details?.[0]?.path).toBe('milestoneId');
  });

  it('refuses a milestone belonging to another project (400, no cross-project probing)', async () => {
    // A real milestone, but on a project the caller does not own.
    const foreignProject = await request(app)
      .post('/api/v1/projects')
      .set(auth(admin))
      .send({
        studentId: st2.id,
        title: 'Foreign project',
        description: 'A second project so its milestone is a cross-project reference.',
      });
    expect(foreignProject.status).toBe(201);
    const foreignProjectId = d(foreignProject).project.id;
    trackedProjectIds.add(foreignProjectId);

    const [foreignMilestone] = await db
      .insert(milestones)
      .values({ projectId: foreignProjectId, title: 'Not yours', position: 0 })
      .returning();

    const res = await createSubmission(st1, {
      title: 'Cross-project milestone probe',
      milestoneId: foreignMilestone.id,
    });
    expect(res.status).toBe(400);
    expect(e(res).details?.[0]?.path).toBe('milestoneId');
  });
});

/* ========================================================================= */

describe('list and scoped access (§11.5, §13.4)', () => {
  let onlyDraftId = '';
  let onlyMilestoneId = '';

  it('lists the project’s submissions and filters by status and milestone', async () => {
    const draft = await createSubmission(st1, { title: 'Filter: draft', body: '<p>d</p>' });
    expect(draft.status).toBe(201);
    onlyDraftId = d(draft).submission.id;

    const tagged = await createSubmission(st1, {
      title: 'Filter: milestone',
      body: '<p>m</p>',
      milestoneId: milestoneA.id,
    });
    expect(tagged.status).toBe(201);
    onlyMilestoneId = d(tagged).submission.id;

    const all = await request(app)
      .get(`/api/v1/projects/${projectId}/submissions`)
      .set(auth(st1));
    expect(all.status).toBe(200);
    expect(d(all).submissions.length).toBeGreaterThan(2);
    expect(d(all).submissions[0].submitter).toMatchObject({ id: st1.id });

    const drafts = await request(app)
      .get(`/api/v1/projects/${projectId}/submissions?status=draft`)
      .set(auth(st1));
    expect(drafts.status).toBe(200);
    expect(d(drafts).submissions.every((s: any) => s.status === 'draft')).toBe(true);
    expect(d(drafts).submissions.map((s: any) => s.id)).toContain(onlyDraftId);

    const byMilestone = await request(app)
      .get(`/api/v1/projects/${projectId}/submissions?milestoneId=${milestoneA.id}`)
      .set(auth(st1));
    expect(byMilestone.status).toBe(200);
    const ids = d(byMilestone).submissions.map((s: any) => s.id);
    expect(ids).toContain(onlyMilestoneId);
    expect(ids).not.toContain(onlyDraftId);
  });

  it('refuses the list, detail and versions to another student (403)', async () => {
    expect(
      (await request(app).get(`/api/v1/projects/${projectId}/submissions`).set(auth(st2))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/submissions/${onlyDraftId}`).set(auth(st2))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/submissions/${onlyDraftId}/versions`).set(auth(st2)))
        .status,
    ).toBe(403);
  });

  it('refuses an unassigned supervisor and allows an administrator (§13.3)', async () => {
    expect(
      (await request(app).get(`/api/v1/submissions/${onlyDraftId}`).set(auth(sup2))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/submissions/${onlyDraftId}`).set(auth(admin))).status,
    ).toBe(200);
  });

  it('answers 404 for an unknown submission and 400 for a malformed one', async () => {
    const unknown = await request(app)
      .get(`/api/v1/submissions/${randomUUID()}`)
      .set(auth(st1));
    expect(unknown.status).toBe(404);

    const malformed = await request(app).get('/api/v1/submissions/nope').set(auth(st1));
    expect(malformed.status).toBe(400);
    expect(e(malformed)).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
