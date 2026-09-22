import { Request, RequestHandler } from 'express';
import { AuthorizationError, NotFoundError } from '../errors/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { findProjectById, ProjectRow, isValidUuid } from '../services/projects.js';
import { findActiveAssignment } from '../services/assignments.js';
import { getProjectAccess } from './access.js';
import { requireUser } from './guards.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * The project loaded by the resource guards. Cached so chained guards
       * and the route handler never re-query it.
       */
      project?: ProjectRow;
    }
  }
}

export interface ProjectGuardOptions {
  /** Route param holding the project id (default: 'projectId'). */
  param?: string;
}

async function loadProject(req: Request, param: string): Promise<ProjectRow> {
  requireUser(req); //401 before any resource knowledge

  const raw = req.params[param];
  const id = typeof raw === 'string' ? raw : undefined;
  const project = id && isValidUuid(id) ? await findProjectById(id) : undefined;
  if (!project) {
    throw new NotFoundError('Project');
  }

  req.project ??= project; // cache for chained guards and the handler
  return project;
}

/**
 * Layer 2 — resource authorization: the student's *own* project only.
 * Strict by design: supervisors and admins do not pass implicitly —
 * compose with `anyOf(..., requireAdmin())` when an override is intended.
 */
export function requireProjectOwner(options: ProjectGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'projectId';

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);
    const project = await loadProject(req, param);

    if (project.studentId !== user.id) {
      throw new AuthorizationError('You can only access your own project');
    }

    next();
  });
}

/** Layer 2 — resource authorization: *assigned* projects only (active assignments). */
export function requireSupervisorAssignment(options: ProjectGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'projectId';

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);
    const project = await loadProject(req, param);

    const assignment = await findActiveAssignment(project.id, user.id);
    if (!assignment) {
      throw new AuthorizationError('You are not assigned to supervise this project');
    }

    next();
  });
}

/**
 * Layer 2 — convenience composite: owner OR assigned supervisor OR admin.
 * Equivalent to `anyOf(requireProjectOwner(), requireSupervisorAssignment(), requireAdmin())`.
 */
export function requireProjectAccess(options: ProjectGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'projectId';

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);
    const project = await loadProject(req, param);

    const access = await getProjectAccess(user, project);
    if (access === null) {
      throw new AuthorizationError('You do not have access to this project');
    }

    next();
  });
}

/** Typed accessor for handlers running behind any resource guard above. */
export function getProject(req: Request): ProjectRow {
  if (!req.project) {
    throw new NotFoundError('Project'); // guard should have loaded it
  }
  return req.project;
}
