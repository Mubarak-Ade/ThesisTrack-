import fs from 'node:fs';
import path from 'node:path';

import { db } from '../../config/db.js';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../errors/index.js';
import type { Role } from '../../lib/roles.js';
import { htmlToText, sanitizeProposalBody } from '../../lib/sanitize.js';
import { removeFileQuietly, resolveStorageKey, UPLOADS_ROOT } from '../../lib/storage.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { ProjectRow } from '../projects/types.js';
import type { UserRow } from '../users/types.js';
import {
  getActiveAssignmentForStudent,
  getCaseload,
} from '../supervisor-assignments/service.js';
import { findUserById, toPublicUser } from '../users/service.js';
import type {
  CreateProposalInput,
  ListProposalsQuery,
  PatchProposalInput,
  ReviewProposalInput,
} from './schema.js';
import * as repo from './repository.js';
import type {
  MilestoneTemplateRow,
  ProposalAttachmentRow,
  ProposalAttachmentView,
  ProposalListPage,
  ProposalRow,
  ProposalStatus,
  ProposalView,
  ProposalWithStudent,
  ReviewRow,
  ReviewView,
  UploadedFile,
} from './types.js';

/* -------------------------------------------------- workflow (spec §5.4) */

/**
 * The §5.4 transition table — copied from the spec, not invented here.
 * Wired to routes through `requireWorkflow` (§13.1 layer 3).
 *
 * `patch`/`attach`/`detach` are edit-family actions: like `submit`, they are
 * legal only while the student owns the content — `draft` or
 * `revision_required` (§11.3's "only in draft | revision_required").
 */
export const PROPOSAL_TRANSITIONS = {
  patch: ['draft', 'revision_required'],
  attach: ['draft', 'revision_required'],
  detach: ['draft', 'revision_required'],
  submit: ['draft', 'revision_required'],
  'start-review': ['submitted'],
  review: ['under_review'],
} as const satisfies Record<string, readonly ProposalStatus[]>;

export type ProposalAction = keyof typeof PROPOSAL_TRANSITIONS;

/** Roles per action — the §4.5 RBAC row for each endpoint. */
export const PROPOSAL_ACTION_ROLES = {
  patch: ['student'],
  attach: ['student'],
  detach: ['student'],
  submit: ['student'],
  'start-review': ['supervisor', 'administrator'],
  review: ['supervisor', 'administrator'],
} as const satisfies Record<ProposalAction, readonly Role[]>;

/* --------------------------------------------------------------- helpers */

/** Postgres unique_violation — race losers map to the same 409/409 truth. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** The exact error `requireWorkflow` reports — races answer the same 422. */
function transitionRace(action: string, status: ProposalStatus): BusinessRuleError {
  return new BusinessRuleError(`Cannot '${action}' while in status '${status}'`, [
    { path: 'status', message: `'${action}' is not permitted from status '${status}'` },
  ]);
}

function toView(row: ProposalWithStudent): ProposalView {
  return {
    id: row.id,
    studentId: row.studentId,
    projectId: row.projectId,
    version: row.version,
    title: row.title,
    abstract: row.abstract,
    body: row.body,
    status: row.status,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    student: toPublicUser(row.student),
  };
}

function toAttachmentView(row: ProposalAttachmentRow): ProposalAttachmentView {
  return {
    id: row.id,
    proposalId: row.proposalId,
    proposalVersion: row.proposalVersion,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

function toReviewView(row: ReviewRow & { reviewer: UserRow }): ReviewView {
  return {
    id: row.id,
    proposalId: row.proposalId,
    submissionId: row.submissionId,
    decision: row.decision,
    comment: row.comment,
    createdAt: row.createdAt,
    reviewer: toPublicUser(row.reviewer),
  };
}

async function loadDetail(id: string): Promise<ProposalWithStudent> {
  const detail = await repo.findProposalDetailById(id);
  if (!detail) {
    throw new NotFoundError('Proposal');
  }
  return detail;
}

/**
 * ADR-14 — sanitize on every write. A body whose text is empty after
 * cleaning (empty editor, markup that stripped to nothing) is stored as
 * NULL: the §11.3 "at least one of body or attachments" rule must see a real
 * absence, not an empty `<p>`. `undefined` passes through — PATCH leaves the
 * stored value untouched.
 */
function normalizeBody(dirty: string | undefined): string | null | undefined {
  if (dirty === undefined) {
    return undefined;
  }
  const clean = sanitizeProposalBody(dirty);
  return htmlToText(clean).trim() === '' ? null : clean;
}

/* ------------------------------------------------------------------ reads */

/** Authz-layer entry point (§13.3) — never exposes the repository. */
export function getProposalById(id: string): Promise<ProposalRow | undefined> {
  return repo.findProposalById(id);
}

/** Authz-layer entry point for `/proposal-attachments/:attachmentId`. */
export async function getProposalAttachment(
  id: string,
): Promise<{ attachment: ProposalAttachmentRow; proposal: ProposalRow } | undefined> {
  const row = await repo.findAttachmentWithProposal(id);
  if (!row) {
    return undefined;
  }
  const { proposal, ...attachment } = row;
  return { attachment, proposal };
}

/** GET /proposals/:proposalId — row + author (the guard already authorized it). */
export async function getProposalDetail(id: string): Promise<ProposalView> {
  return toView(await loadDetail(id));
}

/**
 * GET /proposals — scoped list (§11.3 `?status&studentId&page&limit`):
 *
 *   student       → own proposals only; `?studentId=` may name only yourself
 *   supervisor    → their caseload (verified through an active assignment)
 *   administrator → every student, `?studentId=` as a filter
 */
export async function listProposalsFor(
  actor: AuthUser,
  query: ListProposalsQuery,
): Promise<ProposalListPage> {
  let studentIds: string[] | undefined;

  if (actor.role === 'student') {
    if (query.studentId && query.studentId !== actor.id) {
      throw new AuthorizationError('You can only list your own proposals');
    }
    studentIds = [actor.id];
  } else if (actor.role === 'supervisor') {
    if (query.studentId) {
      const assignment = await getActiveAssignmentForStudent(query.studentId, actor.id);
      if (!assignment) {
        throw new AuthorizationError('You do not have access to this student');
      }
      studentIds = [query.studentId];
    } else {
      const caseload = await getCaseload(actor.id);
      if (caseload.length === 0) {
        return { proposals: [], total: 0 }; // an empty IN list is not a filter
      }
      studentIds = caseload.map((entry) => entry.student.id);
    }
  }

  const { rows, total } = await repo.listProposals({
    studentIds,
    studentId: actor.role === 'administrator' ? query.studentId : undefined,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
  return { proposals: rows.map(toView), total };
}

/** GET /proposals/:proposalId/attachments — every version, newest first. */
export async function listAttachmentsFor(proposalId: string): Promise<ProposalAttachmentView[]> {
  const rows = await repo.listAttachments(proposalId);
  return rows.map(toAttachmentView);
}

/** GET /proposals/:proposalId/reviews — the append-only history (§12 I8). */
export async function listReviewsFor(proposalId: string): Promise<ReviewView[]> {
  const rows = await repo.listReviews(proposalId);
  return rows.map(toReviewView);
}

/* ----------------------------------------------------------------- writes */

/** POST /proposals — draft v1; 409 while an in-flight proposal exists (I4). */
export async function createProposal(
  studentId: string,
  input: CreateProposalInput,
): Promise<ProposalView> {
  const inFlight = await repo.countInFlightProposals(studentId);
  if (inFlight > 0) {
    throw new ConflictError('You already have a proposal in progress');
  }

  try {
    const row = await repo.insertProposal({
      studentId,
      title: input.title,
      abstract: input.abstract,
      body: normalizeBody(input.body), // sanitized on create (ADR-14)
      // status + version come from the schema defaults: draft, v1 (§5.4)
    });
    return toView(await loadDetail(row.id));
  } catch (err) {
    // Lost the race to the partial unique index — same truth (I4).
    if (isUniqueViolation(err)) {
      throw new ConflictError('You already have a proposal in progress');
    }
    throw err;
  }
}

/** PATCH /proposals/:proposalId — edit fields; only draft/revision_required. */
export async function patchProposal(
  proposal: ProposalRow,
  input: PatchProposalInput,
): Promise<ProposalView> {
  const updated = await repo.editProposal(proposal.id, {
    title: input.title,
    abstract: input.abstract,
    body: normalizeBody(input.body), // sanitized on patch (ADR-14)
  });
  if (!updated) {
    // The state moved between the workflow guard and this write.
    throw transitionRace('patch', proposal.status);
  }
  return toView(await loadDetail(updated.id));
}

/**
 * POST /proposals/:proposalId/submit — the §11.3 document content rule:
 * 422 when the body says nothing AND no attachment exists; either alone (or
 * both) passes. Then `version++` freezes this version's documents (I14).
 */
export async function submitProposal(proposal: ProposalRow): Promise<ProposalView> {
  const hasBody = proposal.body !== null && htmlToText(proposal.body).trim() !== '';
  const attachmentCount = await repo.countAttachments(proposal.id);
  if (!hasBody && attachmentCount === 0) {
    throw new BusinessRuleError('Add a document or write your proposal before submitting.');
  }

  const updated = await repo.markSubmitted(proposal.id);
  if (!updated) {
    throw transitionRace('submit', proposal.status);
  }
  return toView(await loadDetail(updated.id));
}

/** POST /proposals/:proposalId/start-review — submitted → under_review. */
export async function startReview(proposal: ProposalRow): Promise<ProposalView> {
  const updated = await repo.transitionProposal(proposal.id, 'under_review', ['submitted']);
  if (!updated) {
    throw transitionRace('start-review', proposal.status);
  }
  return toView(await loadDetail(updated.id));
}

export interface ReviewResult {
  proposal: ProposalView;
  review: ReviewView;
  /** The §5.4 approval product, or null for the two non-approving decisions. */
  project: ProjectRow | null;
}

/**
 * POST /proposals/:proposalId/review (§5.4, §11.3).
 *
 * `approved` runs steps 1–6 in ONE `db.transaction` — project insert,
 * `proposal.project_id` back-fill, `assignment.project_id` back-fill,
 * milestone materialisation, notifications (in the same transaction, §15.4),
 * and the append-only review row. Any failure rolls the whole unit back.
 *
 * Template resolution: explicit `templateId` → seeded `Default` by name →
 * none. Approval therefore never fails because template data is missing;
 * only an explicit unknown id is a request error (400, path `templateId`).
 */
export async function reviewProposal(
  proposal: ProposalRow,
  input: ReviewProposalInput,
  reviewerId: string,
): Promise<ReviewResult> {
  // All reads happen before the transaction: validation errors abort before
  // any row moves, and the transaction below stays writes-only.
  const reviewer = await findUserById(reviewerId);
  if (!reviewer) {
    throw new NotFoundError('User'); // the reviewing account is gone
  }

  let template: MilestoneTemplateRow | undefined;
  if (input.templateId) {
    template = await repo.findTemplateById(input.templateId);
    if (!template) {
      throw new ValidationError('Invalid template', [
        { path: 'templateId', message: 'Milestone template not found' },
      ]);
    }
  }

  const reviewRow = {
    proposalId: proposal.id,
    submissionId: null,
    reviewerId,
    decision: input.decision,
    comment: input.comment ?? null,
  } as const;

  if (input.decision !== 'approved') {
    // Status flip + review row are one unit: a review that never recorded its
    // decision (or a decision with no row) would corrupt the history.
    const updated = await db.transaction(async (tx) => {
      const review = await repo.insertReview(reviewRow, tx);
      const row = await repo.transitionProposal(proposal.id, input.decision, ['under_review'], tx);
      if (!row) {
        throw transitionRace('review', proposal.status); // aborts the insert above
      }
      return { row, review };
    });
    return {
      proposal: toView(await loadDetail(updated.row.id)),
      review: toReviewView({ ...updated.review, reviewer }),
      project: null,
    };
  }

  /* ---- approved: §5.4 steps 1–6, one transaction ---- */

  // I1 (§8.4): a student may hold only one ACTIVE project. Pre-check for a
  // clean 409; the partial unique index remains the race backstop below.
  const existing = await repo.findActiveProjectForStudent(proposal.studentId);
  if (existing) {
    throw new ConflictError('This student already has an active project');
  }

  // Explicit template (validated above) → seeded `Default` by name → none.
  template ??= await repo.findTemplateByName('Default');
  const assignment = await repo.findActiveAssignmentByStudent(proposal.studentId);

  let outcome: { project: ProjectRow; review: ReviewRow };
  try {
    outcome = await db.transaction(async (tx) => {
      // 1. INSERT projects (description = the proposal's abstract).
      const project = await repo.insertProject(
        {
          studentId: proposal.studentId,
          title: proposal.title,
          description: proposal.abstract,
          status: 'active',
        },
        tx,
      );

      // 2. UPDATE proposals SET project_id + status = approved.
      await repo.backfillProposalProject(proposal.id, project.id, tx);
      const approved = await repo.transitionProposal(proposal.id, 'approved', ['under_review'], tx);
      if (!approved) {
        throw transitionRace('review', proposal.status); // rolls back step 1
      }

      // 3. UPDATE supervisor_assignments SET project_id (no active row = no-op:
      //    §5.4 tolerates it; the admin flow may have none yet).
      await repo.backfillActiveAssignmentProject(proposal.studentId, project.id, tx);

      // 4. Materialise milestones: `due_at = project.created_at + offset`.
      //    Missing template or empty items → zero rows, never a failure.
      if (template && template.items.length > 0) {
        const base = project.createdAt.getTime();
        await repo.insertMilestones(
          template.items.map((item, position) => ({
            projectId: project.id,
            title: item.title.slice(0, 255), // template text must fit varchar(255)
            description: item.description,
            position,
            dueAt: new Date(base + item.dueOffsetDays * 86_400_000),
            status: 'pending' as const,
          })),
          tx,
        );
      }

      // 5. Notifications, same transaction (§15.4): the student always, the
      //    assigned supervisor when one exists (§15.2 — proposal approved).
      await repo.insertNotification(
        {
          userId: proposal.studentId,
          type: 'proposal',
          title: 'Proposal approved',
          message: `Your proposal "${proposal.title}" has been approved — your project is now active.`,
          resourceType: 'project',
          resourceId: project.id,
        },
        tx,
      );
      if (assignment) {
        await repo.insertNotification(
          {
            userId: assignment.supervisorId,
            type: 'proposal',
            title: 'Proposal approved',
            message: `The proposal "${proposal.title}" you supervise has been approved.`,
            resourceType: 'project',
            resourceId: project.id,
          },
          tx,
        );
      }

      // 6. The append-only review row (§12 I8).
      const review = await repo.insertReview(reviewRow, tx);
      return { project, review };
    });
  } catch (err) {
    // I1 backstop: two approvals raced past the pre-check; the loser's
    // transaction never existed.
    if (isUniqueViolation(err)) {
      throw new ConflictError('This student already has an active project');
    }
    throw err;
  }

  return {
    proposal: toView(await loadDetail(proposal.id)),
    review: toReviewView({ ...outcome.review, reviewer }),
    project: outcome.project,
  };
}

/* --------------------------------------------------------------- documents */

/**
 * POST /proposals/:proposalId/attachments — persist the uploaded file's row,
 * tagged with the proposal's current `version` (I14). The bytes are already
 * on disk under a server-derived name; if this insert fails, the route's
 * close handler unlinks them (never committed).
 */
export async function addAttachment(
  proposal: ProposalRow,
  file: UploadedFile,
  uploaderId: string,
): Promise<ProposalAttachmentView> {
  const row = await repo.insertAttachment({
    proposalId: proposal.id,
    proposalVersion: proposal.version,
    // Both sides are server-derived: root + multer's absolute path → relative key.
    storageKey: path.relative(UPLOADS_ROOT, file.path),
    originalFilename: file.originalname.slice(0, 255), // display only (§14.4)
    mimeType: file.mimetype,
    sizeBytes: file.size,
    uploadedBy: uploaderId,
  });
  return toAttachmentView(row);
}

/**
 * DELETE /proposal-attachments/:attachmentId — I14: removable only while the
 * parent is draft/revision_required (the workflow guard enforces that; the
 * conditional DELETE re-checks it so the invariant holds even in a race).
 * Row first, bytes second — see the repository comment.
 */
export async function removeAttachment(
  bundle: { attachment: ProposalAttachmentRow; proposal: ProposalRow },
): Promise<ProposalAttachmentView> {
  const removed = await repo.deleteAttachment(bundle.attachment.id);
  if (!removed) {
    throw new ConflictError('This attachment can no longer be deleted');
  }
  await removeFileQuietly(resolveStorageKey(removed.storageKey));
  return toAttachmentView(removed);
}

export interface AttachmentDownload {
  stream: fs.ReadStream;
  sizeBytes: number;
  mimeType: string;
  originalFilename: string;
}

/**
 * GET /proposal-attachments/:attachmentId/download — resolve the stored key
 * (containment-checked), verify the bytes exist, and hand the controller a
 * stream with §14.5's header values. Never `express.static` (ADR-09).
 */
export async function openAttachment(
  attachment: ProposalAttachmentRow,
): Promise<AttachmentDownload> {
  const absolute = resolveStorageKey(attachment.storageKey);
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
    sizeBytes: attachment.sizeBytes,
    mimeType: attachment.mimeType,
    originalFilename: attachment.originalFilename,
  };
}
