import type { Request, RequestHandler } from 'express';
import type { AuthUser } from '../middleware/auth.js';
import { AuthorizationError, NotFoundError } from '../errors/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { isValidUuid } from '../lib/uuid.js';
import { getProposalAttachment, getProposalById } from '../modules/proposals/service.js';
import { getActiveAssignmentForStudent } from '../modules/supervisor-assignments/service.js';
import type { ProposalAttachmentRow, ProposalRow } from '../modules/proposals/types.js';
import { requireUser } from './guards.js';

declare global {
  namespace Express {
    interface Request {
      /** The proposal loaded by the proposal/attachment resource guards. */
      proposal?: ProposalRow;
      /** The attachment row loaded by the attachment resource guards. */
      proposalAttachment?: ProposalAttachmentRow;
    }
  }
}

/**
 * Access level a user holds over a single proposal (spec §13.3).
 *
 * - `'owner'`      — the proposal's own student
 * - `'supervisor'` — that student's ACTIVE supervisor
 * - `'admin'`      — administrator
 * - `null`         — no relationship
 */
export type ProposalAccess = 'owner' | 'supervisor' | 'admin';

/**
 * **The rule this build exists to enforce:** every proposal-scoped
 * authorization resolves through `student_id`, never through `project_id`
 * (spec §13.3). A proposal can be read before its project exists — that is the
 * whole point of §8.3's nullable `project_id` — so a project-keyed lookup would
 * deny the student's own supervisor access to the very document they must review.
 *
 * `proposal.studentId` is NOT NULL, which is what makes this possible: no
 * project lookup, no null handling, one direct (student, supervisor) query.
 *
 * Evaluated in the order §13.3 documents. The three tests are mutually
 * exclusive by construction — a proposal's student cannot simultaneously be an
 * administrator holding an assignment with themselves — so the ordering is
 * documentation, not a tiebreak.
 */
export async function resolveProposalAccess(
  proposal: Pick<{ studentId: string }, 'studentId'>,
  user: AuthUser,
): Promise<ProposalAccess | null> {
  if (proposal.studentId === user.id) {
    return 'owner';
  }

  const assignment = await getActiveAssignmentForStudent(proposal.studentId, user.id);
  if (assignment) {
    return 'supervisor';
  }

  if (user.role === 'administrator') {
    return 'admin';
  }

  return null;
}

export interface ProposalGuardOptions {
  /** Route param holding the proposal id (default: 'proposalId'). */
  param?: string;
  /** Access levels permitted through (default: every level — read routes). */
  allow?: readonly ProposalAccess[];
}

async function loadProposal(req: Request, param: string): Promise<ProposalRow> {
  requireUser(req); // 401 before any resource knowledge

  const raw = req.params[param];
  const id = typeof raw === 'string' ? raw : undefined;
  // Malformed ids are refused before Postgres sees them → 404, same as an
  // unknown id, so existence is never disclosed (§13.5).
  const proposal = id && isValidUuid(id) ? await getProposalById(id) : undefined;
  if (!proposal) {
    throw new NotFoundError('Proposal');
  }

  req.proposal ??= proposal; // cache for chained guards and the handler
  return proposal;
}

/**
 * Layer 2 — resource authorization for proposal-scoped routes (§9.4, §13.3).
 *
 * Reads pass `allow` default (owner / assigned supervisor / admin); write
 * routes narrow it (`{ allow: ['owner'] }` for student edits). Resolution is
 * always through `student_id` — never `project_id` — per §13.3.
 */
export function requireProposalAccess(options: ProposalGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'proposalId';
  const allow = options.allow ?? ['owner', 'supervisor', 'admin'];

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);
    const proposal = await loadProposal(req, param);

    const access = await resolveProposalAccess(proposal, user);
    if (access === null || !allow.includes(access)) {
      throw new AuthorizationError('You do not have access to this proposal');
    }

    next();
  });
}

export interface AttachmentGuardOptions {
  /** Route param holding the attachment id (default: 'attachmentId'). */
  param?: string;
  /** Access levels permitted through (default: every level — read routes). */
  allow?: readonly ProposalAccess[];
}

/**
 * Layer 2 — resource authorization for `/proposal-attachments/:attachmentId`.
 *
 * Loads the attachment AND caches its parent proposal on `req.proposal`, so
 * the workflow guard and the handler never re-query. Access still resolves
 * through the parent's `student_id` (§13.3) — the attachment row itself is
 * not an authorization subject.
 */
export function requireAttachmentAccess(options: AttachmentGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'attachmentId';
  const allow = options.allow ?? ['owner', 'supervisor', 'admin'];

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);

    const raw = req.params[param];
    const id = typeof raw === 'string' ? raw : undefined;
    const bundle = id && isValidUuid(id) ? await getProposalAttachment(id) : undefined;
    if (!bundle) {
      throw new NotFoundError('Proposal attachment');
    }

    req.proposalAttachment ??= bundle.attachment;
    req.proposal ??= bundle.proposal;

    const access = await resolveProposalAccess(bundle.proposal, user);
    if (access === null || !allow.includes(access)) {
      throw new AuthorizationError('You do not have access to this proposal attachment');
    }

    next();
  });
}
