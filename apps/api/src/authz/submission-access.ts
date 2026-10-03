import type { Request, RequestHandler } from 'express';

import { AuthorizationError, NotFoundError } from '../errors/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { isValidUuid } from '../lib/uuid.js';
import { getProjectById } from '../modules/projects/service.js';
import {
  getSubmissionById,
  getSubmissionVersion,
} from '../modules/submissions/service.js';
import type { SubmissionRow, SubmissionVersionRow } from '../modules/submissions/types.js';
import { getProjectAccess, type ProjectAccess } from './access.js';
import { requireUser } from './guards.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * The submission loaded by the submission resource guards — cached so
       * chained guards and the handler never re-query it.
       */
      submission?: SubmissionRow;
      /** The version loaded by the `/submission-versions/...` guard. */
      submissionVersion?: SubmissionVersionRow;
    }
  }
}

/**
 * Access level over a submission = access over its project (§14.2's
 * authorization row: "requireProjectAccess via submission.project_id").
 */
export type SubmissionAccess = ProjectAccess;

export interface SubmissionGuardOptions {
  /** Route param holding the submission id (default: 'submissionId'). */
  param?: string;
  /** Access levels permitted through (default: owner / supervisor / admin). */
  allow?: readonly SubmissionAccess[];
}

/**
 * Layer 2 — resource authorization for `/submissions/:submissionId`.
 *
 * Loads the submission, caches it on `req.submission`, and resolves access
 * through its **project** (§13.3's projectId key). Writes narrow with
 * `{ allow: ['owner'] }` so only the student who owns the project may touch
 * the record — §4.5's "Submission — create / edit / submit / new version (own)".
 *
 * Ordering follows the rest of the layer: a malformed id is refused by
 * `validate(params)` before this guard runs (400, the §9.4 convention pinned
 * in Phase 3), so the `isValidUuid` check here is defense in depth and an
 * unknown-but-well-formed id answers 404 (§13.5).
 */
export function requireSubmissionAccess(options: SubmissionGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'submissionId';
  const allow = options.allow ?? ['owner', 'supervisor', 'admin'];

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);

    const raw = req.params[param];
    const id = typeof raw === 'string' ? raw : undefined;
    const submission = id && isValidUuid(id) ? await getSubmissionById(id) : undefined;
    if (!submission) {
      throw new NotFoundError('Submission');
    }
    req.submission ??= submission;

    const project: Awaited<ReturnType<typeof getProjectById>> = await getProjectById(
      submission.projectId,
    );
    if (!project) {
      throw new NotFoundError('Project'); // cascade says this cannot happen
    }
    req.project ??= project; // the handler may need it (list/detail paths)

    const access = await getProjectAccess(user, project);
    if (access === null || !allow.includes(access)) {
      throw new AuthorizationError('You do not have access to this submission');
    }

    next();
  });
}

export interface SubmissionVersionGuardOptions {
  /** Route param holding the version id (default: 'versionId'). */
  param?: string;
  /** Access levels permitted through (default: owner / supervisor / admin). */
  allow?: readonly SubmissionAccess[];
}

/**
 * Layer 2 — resource authorization for `/submission-versions/:versionId`
 * (§14.5): resolve the version, then authorize exactly as §14.2 prescribes —
 * `requireProjectAccess` through `submission.project_id`. A version whose
 * parent cannot be loaded answers 404; an existing version the caller has no
 * relationship to answers 403 (§13.5: existence is never masked).
 */
export function requireSubmissionVersionAccess(
  options: SubmissionVersionGuardOptions = {},
): RequestHandler {
  const param = options.param ?? 'versionId';
  const allow = options.allow ?? ['owner', 'supervisor', 'admin'];

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);

    const raw = req.params[param];
    const id = typeof raw === 'string' ? raw : undefined;
    const bundle = id && isValidUuid(id) ? await getSubmissionVersion(id) : undefined;
    if (!bundle) {
      throw new NotFoundError('Submission version');
    }
    req.submissionVersion ??= bundle.version;
    req.submission ??= bundle.submission;

    const project = await getProjectById(bundle.submission.projectId);
    if (!project) {
      throw new NotFoundError('Project'); // cascade says this cannot happen
    }
    req.project ??= project;

    const access = await getProjectAccess(user, project);
    if (access === null || !allow.includes(access)) {
      throw new AuthorizationError('You do not have access to this submission');
    }

    next();
  });
}

/** Typed accessor for handlers running behind `requireSubmissionAccess`. */
export function getSubmission(req: Request): SubmissionRow {
  if (!req.submission) {
    throw new NotFoundError('Submission'); // guard should have loaded it
  }
  return req.submission;
}

/** Typed accessor for handlers running behind `requireSubmissionVersionAccess`. */
export function getSubmissionVersionRow(req: Request): SubmissionVersionRow {
  if (!req.submissionVersion) {
    throw new NotFoundError('Submission version'); // guard should have loaded it
  }
  return req.submissionVersion;
}
