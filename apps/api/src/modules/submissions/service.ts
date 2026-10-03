import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { db } from '../../config/db.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../errors/index.js';
import { notify } from '../../lib/notify.js';
import type { Role } from '../../lib/roles.js';
import { htmlToText, sanitizeProposalBody } from '../../lib/sanitize.js';
import {
  extensionForMime,
  removeEmptyDirQuietly,
  removeFileQuietly,
  resolveStorageKey,
  UPLOADS_ROOT,
} from '../../lib/storage.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { ProjectRow } from '../projects/types.js';
import { findActiveSupervisorIdForStudent } from '../supervisor-assignments/service.js';
import { toPublicUser } from '../users/service.js';
import type {
  CreateSubmissionInput,
  ListSubmissionsQuery,
  PatchSubmissionInput,
} from './schema.js';
import * as repo from './repository.js';
import type {
  SubmissionListFilters,
  SubmissionRow,
  SubmissionStatus,
  SubmissionVersionRow,
  SubmissionVersionView,
  SubmissionView,
  SubmissionWithSubmitter,
  UploadedFile,
} from './types.js';

/* -------------------------------------------------------- workflow (§5.5) */

/**
 * The §5.5 transition table — copied from the spec's LOCKED flow, not
 * invented here. Wired to routes through `requireWorkflow` (§13.1 layer 3).
 *
 *   patch / delete  → draft only (§11.5)
 *   submit          → draft only (§5.5: DRAFT ──submit──► SUBMITTED)
 *   append          → draft | revision_required (the optional attach step and
 *                     the revision arrow; submitting already-submitted or
 *                     decided work is refused — §5.5 shows no such edge)
 */
export const SUBMISSION_TRANSITIONS = {
  patch: ['draft'],
  delete: ['draft'],
  submit: ['draft'],
  append: ['draft', 'revision_required'],
} as const satisfies Record<string, readonly SubmissionStatus[]>;

export type SubmissionAction = keyof typeof SUBMISSION_TRANSITIONS;

/** Roles per action — the §4.5 RBAC row for each endpoint. */
export const SUBMISSION_ACTION_ROLES = {
  patch: ['student'],
  delete: ['student'],
  submit: ['student'],
  append: ['student'],
} as const satisfies Record<SubmissionAction, readonly Role[]>;

/* --------------------------------------------------------------- helpers */

/** Postgres unique_violation — race losers map to the same 409/409 truth. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** The exact error `requireWorkflow` reports — races answer the same 422. */
function transitionRace(action: string, status: SubmissionStatus): BusinessRuleError {
  return new BusinessRuleError(`Cannot '${action}' while in status '${status}'`, [
    { path: 'status', message: `'${action}' is not permitted from status '${status}'` },
  ]);
}

/**
 * ADR-14's write-time rule applied to submission bodies: sanitize on every
 * write (create, patch, append) and store the already-clean HTML, because a
 * submission body is rendered by the supervisor exactly like a proposal body
 * (§10.1 — stored XSS has no place in either). A body whose text is empty
 * after cleaning is `NULL`, i.e. *no content*, so the "exactly one of
 * body / file" rule (§14.2) sees a real absence rather than an empty `<p>`.
 * `undefined` passes through — "not provided" is not "cleared".
 */
function normalizeBody(dirty: string | undefined): string | null | undefined {
  if (dirty === undefined) {
    return undefined;
  }
  const clean = sanitizeProposalBody(dirty);
  return htmlToText(clean).trim() === '' ? null : clean;
}

function toView(row: SubmissionWithSubmitter): SubmissionView {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    submittedBy: row.submittedBy,
    title: row.title,
    status: row.status,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submitter: toPublicUser(row.submitter),
  };
}

function toVersionView(row: SubmissionVersionRow): SubmissionVersionView {
  return {
    id: row.id,
    submissionId: row.submissionId,
    versionNumber: row.versionNumber,
    body: row.body,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

async function loadDetail(id: string): Promise<SubmissionWithSubmitter> {
  const detail = await repo.findSubmissionDetailById(id);
  if (!detail) {
    throw new NotFoundError('Submission');
  }
  return detail;
}

/**
 * Server-derived placement of an uploaded file (§14.3, §14.4): the path is
 * `uploads/<projectId>/<submissionId>/v<version>-<uuid>.<ext>` where both ids
 * are UUIDs the *server* chose (create pre-generates the submission id; append
 * reads it from the guarded row) and the extension comes from the MIME map —
 * no client string ever reaches the filesystem. The bytes arrive staged in
 * `uploads/tmp/` (multer needs a destination before the row exists) and are
 * `rename`d here; returns the final absolute path.
 */
async function placeUpload(
  file: UploadedFile,
  target: { projectId: string; submissionId: string; versionNumber: number },
): Promise<string> {
  const dir = path.join(UPLOADS_ROOT, target.projectId, target.submissionId);
  await fs.promises.mkdir(dir, { recursive: true });
  const finalPath = path.join(
    dir,
    `v${target.versionNumber}-${randomUUID()}${extensionForMime(file.mimetype)}`,
  );
  await fs.promises.rename(file.path, finalPath);
  return finalPath;
}

/** A placement that never became a row: bytes back out, empty dir too. */
async function discardPlacedFile(absolutePath: string): Promise<void> {
  await removeFileQuietly(absolutePath);
  await removeEmptyDirQuietly(path.dirname(absolutePath));
}

/* ------------------------------------------------------------------ reads */

/** Authz-layer entry point (§13.3) — never exposes the repository. */
export function getSubmissionById(id: string): Promise<SubmissionRow | undefined> {
  return repo.findSubmissionById(id);
}

/** Authz-layer entry point for `/submission-versions/:versionId` (§14.5). */
export async function getSubmissionVersion(
  id: string,
): Promise<{ version: SubmissionVersionRow; submission: SubmissionRow } | undefined> {
  const row = await repo.findVersionWithSubmission(id);
  if (!row) {
    return undefined;
  }
  const { submission, ...version } = row;
  return { version, submission };
}

/** GET /submissions/:submissionId — row + author (the guard already allowed it). */
export async function getSubmissionDetail(id: string): Promise<SubmissionView> {
  return toView(await loadDetail(id));
}

/** GET /projects/:projectId/submissions — §11.5 `?milestoneId&status`. */
export async function listSubmissionsFor(
  project: ProjectRow,
  query: ListSubmissionsQuery,
): Promise<SubmissionView[]> {
  const filters: SubmissionListFilters = {
    milestoneId: query.milestoneId,
    status: query.status,
  };
  const rows = await repo.listSubmissions(project.id, filters);
  return rows.map(toView);
}

/** GET /submissions/:submissionId/versions — immutable history, newest first. */
export async function listVersionsFor(submissionId: string): Promise<SubmissionVersionView[]> {
  const rows = await repo.listVersions(submissionId);
  return rows.map(toVersionView);
}

/* ----------------------------------------------------------------- writes */

/**
 * POST /submissions (§11.5) — `draft`, with content arriving either as a
 * JSON `body` or as a multipart file. Both materialise **version 1** right
 * away: the `submissions` table has no content column, so content can only
 * live in a version row (§14.2), and §5.5's optional-attach step is the same
 * door. A title-only create leaves zero versions — `/submit` creates version 1
 * then (§5.5 "creates version 1 if none exists").
 *
 * Ordering: the file is placed first, the rows second, and a failed insert
 * unlinks the placement — bytes never land without their row (the reverse
 * would leave a row 404ing forever).
 */
export async function createSubmission(
  actor: AuthUser,
  input: CreateSubmissionInput,
  file?: UploadedFile,
): Promise<SubmissionView> {
  if (input.milestoneId) {
    const milestone = await repo.findMilestoneInProject(input.milestoneId, input.projectId);
    if (!milestone) {
      throw new ValidationError('Invalid milestone', [
        { path: 'milestoneId', message: 'Milestone not found for this project' },
      ]);
    }
  }

  const submissionId = randomUUID(); // server-chosen: §14.4 destination from ids
  const body = normalizeBody(input.body);
  const content = file ?? (typeof body === 'string' ? body : null);

  // §15.2 "Submission created → assigned supervisor" — the recipient is
  // resolved before the unit (§15.4). The actor owns the project (§4.5's
  // create row is owner-student only), so the student key is the actor.
  const supervisorId = await findActiveSupervisorIdForStudent(actor.id);

  let placed: string | undefined;
  if (file) {
    placed = await placeUpload(file, {
      projectId: input.projectId,
      submissionId,
      versionNumber: 1,
    });
  }

  try {
    await db.transaction(async (tx) => {
      await repo.insertSubmission(
        {
          id: submissionId,
          projectId: input.projectId,
          milestoneId: input.milestoneId ?? null,
          submittedBy: actor.id,
          title: input.title,
          // status + submitted_at come from the schema defaults: draft, null.
        },
        tx,
      );

      // §15.2 "Submission created → assigned supervisor" (§15.4): the row and
      // its announcement commit together — a notification can never reference
      // a submission that rolled back.
      if (supervisorId) {
        await notify(
          {
            userId: supervisorId,
            type: 'submission',
            title: 'Submission created',
            message: `A new submission "${input.title}" has been created in a project you supervise.`,
            resourceType: 'submission',
            resourceId: submissionId,
          },
          tx,
        );
      }

      if (typeof content === 'string') {
        await repo.insertVersion(
          {
            submissionId,
            versionNumber: 1,
            body: content,
            storageKey: null,
            originalFilename: null,
            mimeType: null,
            sizeBytes: null,
            uploadedBy: actor.id,
          },
          tx,
        );
      } else if (content) {
        await repo.insertVersion(
          {
            submissionId,
            versionNumber: 1,
            body: null,
            storageKey: path.relative(UPLOADS_ROOT, placed!), // server-derived
            originalFilename: content.originalname.slice(0, 255), // display only
            mimeType: content.mimetype,
            sizeBytes: content.size,
            uploadedBy: actor.id,
          },
          tx,
        );
      }
    });
  } catch (err) {
    if (placed) {
      await discardPlacedFile(placed);
    }
    throw err;
  }

  return toView(await loadDetail(submissionId));
}

/**
 * PATCH /submissions/:submissionId — §11.5 `draft` only.
 *
 * `body` is content, and content is immutable once versioned (I7): it is
 * accepted only while the submission has **no** version, where it *inserts*
 * version 1 (never updates an existing row). Once a version exists the answer
 * is a 422 pointing at `POST …/versions`.
 */
export async function patchSubmission(
  submission: SubmissionRow,
  input: PatchSubmissionInput,
): Promise<SubmissionView> {
  if (input.milestoneId) {
    const milestone = await repo.findMilestoneInProject(input.milestoneId, submission.projectId);
    if (!milestone) {
      throw new ValidationError('Invalid milestone', [
        { path: 'milestoneId', message: 'Milestone not found for this project' },
      ]);
    }
  }

  const clean = normalizeBody(input.body);
  if (typeof clean === 'string') {
    const existing = await repo.countVersions(submission.id);
    if (existing > 0) {
      throw new BusinessRuleError('This submission already has version 1', [
        {
          path: 'body',
          message: 'Versions are immutable — append a new version instead',
        },
      ]);
    }
  }

  try {
    // One unit: the field edit and the version-1 insert either both land or
    // neither does. The detail is re-read *after* the commit — a `db.query`
    // join runs on its own connection and would not see uncommitted rows.
    await db.transaction(async (tx) => {
      const updated = await repo.editSubmissionIfDraft(
        submission.id,
        { title: input.title, milestoneId: input.milestoneId },
        tx,
      );
      if (!updated) {
        throw transitionRace('patch', submission.status); // the state moved
      }
      if (typeof clean === 'string') {
        await repo.insertVersion(
          {
            submissionId: submission.id,
            versionNumber: 1,
            body: clean,
            storageKey: null,
            originalFilename: null,
            mimeType: null,
            sizeBytes: null,
            uploadedBy: updated.submittedBy,
          },
          tx,
        );
      }
    });
  } catch (err) {
    // Two drafts raced to create version 1 — the loser sees the same truth.
    if (isUniqueViolation(err)) {
      throw new ConflictError('This submission already has version 1');
    }
    throw err;
  }

  return toView(await loadDetail(submission.id));
}

/**
 * POST /submissions/:submissionId/submit (§5.5) — `draft` → `submitted`, and
 * **version 1 is created if none exists** (§11.5). A submission that never
 * carried content therefore records an empty text version, which keeps the
 * immutable sequence complete from 1; whether content is *acceptable* is the
 * reviewer's judgment at §11.6, not this endpoint's.
 */
export async function submitSubmission(
  submission: SubmissionRow,
  userId: string,
): Promise<SubmissionView> {
  await db.transaction(async (tx) => {
    const next = await repo.nextVersionNumber(submission.id, tx);
    if (next === 1) {
      await repo.insertVersion(
        {
          submissionId: submission.id,
          versionNumber: 1,
          body: '',
          storageKey: null,
          originalFilename: null,
          mimeType: null,
          sizeBytes: null,
          uploadedBy: userId,
        },
        tx,
      );
    }
    const updated = await repo.markSubmittedIfDraft(submission.id, tx);
    if (!updated) {
      throw transitionRace('submit', submission.status); // rolls the insert back
    }
  });
  return toView(await loadDetail(submission.id));
}

/**
 * POST /submissions/:submissionId/versions (§11.5) — appends
 * `version_number = max+1`; a `revision_required` submission returns to
 * `submitted`, a `draft` stays a draft until `/submit` (§5.5).
 *
 * Exactly one of file/body is enforced by the controller; bytes are placed
 * before the rows so a failed insert can unlink them, and the `UNIQUE`
 * constraint turns a concurrent append into a 409 rather than a duplicate.
 */
export async function appendVersion(
  submission: SubmissionRow,
  input: { file?: UploadedFile; body?: string },
  userId: string,
): Promise<{ submission: SubmissionView; version: SubmissionVersionView }> {
  const clean = normalizeBody(input.body);
  if (!input.file && typeof clean !== 'string') {
    throw new ValidationError('A file or a body is required', [
      { path: 'body', message: 'Body is empty' },
    ]);
  }

  const versionNumber = await repo.nextVersionNumber(submission.id);
  let placed: string | undefined;
  if (input.file) {
    placed = await placeUpload(input.file, {
      projectId: submission.projectId,
      submissionId: submission.id,
      versionNumber,
    });
  }

  let created: SubmissionVersionRow;
  try {
    created = await db.transaction(async (tx) => {
      const version = await repo.insertVersion(
        {
          submissionId: submission.id,
          versionNumber,
          body: typeof clean === 'string' ? clean : null,
          storageKey: input.file && placed ? path.relative(UPLOADS_ROOT, placed) : null,
          originalFilename: input.file ? input.file.originalname.slice(0, 255) : null,
          mimeType: input.file ? input.file.mimetype : null,
          sizeBytes: input.file ? input.file.size : null,
          uploadedBy: userId,
        },
        tx,
      );
      const updated = await repo.markAppendStatus(submission.id, tx);
      if (!updated) {
        throw transitionRace('append', submission.status); // rolls the insert back
      }
      return version;
    });
  } catch (err) {
    if (placed) {
      await discardPlacedFile(placed); // the row never committed — bytes out
    }
    if (isUniqueViolation(err)) {
      throw new ConflictError('Another version was appended at the same time — reload and try again');
    }
    throw err;
  }

  return {
    submission: toView(await loadDetail(submission.id)),
    version: toVersionView(created),
  };
}

/**
 * DELETE /submissions/:submissionId (§11.5, §14.6) — `draft` only, and the
 * draft's files come out **in the same transaction** as its rows: the keys are
 * read first, the conditional delete proves the row was still a draft (409
 * otherwise, before any byte moves), and only then are the files unlinked.
 * Unlinking can no longer throw (quiet by contract), so a rollback after this
 * point is not a realistic outcome — and the safe direction is the one taken:
 * a lost file is an orphan, a row without bytes would 404 forever.
 */
export async function deleteSubmission(submission: SubmissionRow): Promise<SubmissionView> {
  const view = toView(await loadDetail(submission.id));

  await db.transaction(async (tx) => {
    const keys = await repo.listStorageKeys(submission.id, tx);
    const removed = await repo.deleteSubmissionIfDraft(submission.id, tx);
    if (!removed) {
      throw new ConflictError('This submission can no longer be deleted');
    }
    for (const key of keys) {
      await removeFileQuietly(resolveStorageKey(key));
    }
    if (keys.length > 0) {
      await removeEmptyDirQuietly(path.dirname(resolveStorageKey(keys[0])));
    }
  });

  return view;
}

/* --------------------------------------------------------------- download */

export interface VersionDownload {
  stream: fs.ReadStream;
  sizeBytes: number;
  mimeType: string;
  originalFilename: string;
}

/**
 * GET /submission-versions/:versionId/download (§14.5) — resolve the stored
 * key (containment-checked), verify the bytes exist, and hand the controller
 * a stream with §14.5's header values. Never `express.static` (ADR-09); a
 * text-only version has no bytes and answers 404 rather than a fake stream.
 */
export async function openVersion(version: SubmissionVersionRow): Promise<VersionDownload> {
  if (!version.storageKey) {
    throw new NotFoundError('File'); // §14.2 text version — nothing was uploaded
  }
  const absolute = resolveStorageKey(version.storageKey);
  try {
    await fs.promises.stat(absolute);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError('File'); // row survives, bytes lost — report honestly
    }
    throw err;
  }
  return {
    stream: fs.createReadStream(absolute),
    sizeBytes: version.sizeBytes ?? 0,
    mimeType: version.mimeType ?? 'application/octet-stream',
    originalFilename:
      version.originalFilename ?? `version-${version.versionNumber}.txt`,
  };
}
