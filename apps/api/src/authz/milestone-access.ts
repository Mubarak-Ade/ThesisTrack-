import type { Request, RequestHandler } from 'express';
import { AuthorizationError, NotFoundError } from '../errors/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { isValidUuid } from '../lib/uuid.js';
import { getMilestoneById } from '../modules/milestones/service.js';
import { getProjectById } from '../modules/projects/service.js';
import type { MilestoneRow } from '../modules/milestones/types.js';
import type { ProjectRow } from '../modules/projects/types.js';
import { getProjectAccess, type ProjectAccess } from './access.js';
import { requireUser } from './guards.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * The milestone loaded by the milestone resource guard — cached so
       * chained guards and the handler never re-query it.
       */
      milestone?: MilestoneRow;
    }
  }
}

/** Access level over a milestone = access over its project (§4.5 rows). */
export type MilestoneAccess = ProjectAccess;

export interface MilestoneGuardOptions {
  /** Route param holding the milestone id (default: 'milestoneId'). */
  param?: string;
  /** Access levels permitted through (default: owner / supervisor / admin). */
  allow?: readonly MilestoneAccess[];
}

/**
 * Layer 2 — resource authorization for `/milestones/:milestoneId`.
 *
 * Loads the milestone, caches it on `req.milestone`, and resolves access
 * through its **project** (owner / assigned supervisor / admin — §13.3's
 * projectId key). Writes narrow with `{ allow: ['supervisor', 'admin'] }`;
 * the status route keeps the default because §11.4 lets a student move their
 * OWN milestone through the restricted target chain — the per-role target
 * matrix itself is a service rule (§9.4: guards decide *who*, services decide
 * *what*).
 */
export function requireMilestoneAccess(options: MilestoneGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'milestoneId';
  const allow = options.allow ?? ['owner', 'supervisor', 'admin'];

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);

    const raw = req.params[param];
    const id = typeof raw === 'string' ? raw : undefined;
    // Malformed ids are refused before Postgres sees them → 404, same as an
    // unknown id (§13.5), matching how the guards around it behave.
    const milestone = id && isValidUuid(id) ? await getMilestoneById(id) : undefined;
    if (!milestone) {
      throw new NotFoundError('Milestone');
    }
    req.milestone ??= milestone;

    const project: ProjectRow | undefined = await getProjectById(milestone.projectId);
    if (!project) {
      throw new NotFoundError('Project'); // cascade says this cannot happen
    }
    req.project ??= project; // the handler may need it (create/reorder paths)

    const access = await getProjectAccess(user, project);
    if (access === null || !allow.includes(access)) {
      throw new AuthorizationError('You do not have access to this milestone');
    }

    next();
  });
}

/** Typed accessor for handlers running behind `requireMilestoneAccess`. */
export function getMilestone(req: Request): MilestoneRow {
  if (!req.milestone) {
    throw new NotFoundError('Milestone'); // guard should have loaded it
  }
  return req.milestone;
}
