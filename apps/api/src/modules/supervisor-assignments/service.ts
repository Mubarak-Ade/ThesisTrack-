import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../errors/index.js';
import { db } from '../../config/db.js';
import { getProjectById } from '../projects/service.js';
import { findUserById, toPublicUser } from '../users/service.js';
import type { ProjectRow } from '../projects/types.js';
import type { UserRow } from '../users/types.js';
import {
  endAssignment,
  findActiveAssignment,
  findActiveAssignmentForProject,
  findActiveAssignmentDetail,
  insertAssignment,
  listEndedAssignments,
} from './repository.js';
import type {
  AssignmentOverview,
  AssignmentView,
  SupervisorAssignmentRow,
} from './types.js';

/** Postgres unique_violation — the active-assignment DB backstop (race lost). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * Entry point for the authz layer (moved here from modules/projects —
 * an assignment row describes THIS module's entity, not the project's).
 */
export function getActiveAssignment(
  projectId: string,
  supervisorId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return findActiveAssignment(projectId, supervisorId);
}

function toView(
  row: SupervisorAssignmentRow,
  supervisor: UserRow,
): AssignmentView {
  return {
    id: row.id,
    projectId: row.projectId,
    isPrimary: row.isPrimary,
    assignedAt: row.assignedAt,
    endedAt: row.endedAt,
    assignedBy: row.assignedBy,
    supervisor: toPublicUser(supervisor),
  };
}

/** GET — the active relationship plus the preserved history, side by side. */
export async function getAssignmentOverview(projectId: string): Promise<AssignmentOverview> {
  const [active, history] = await Promise.all([
    findActiveAssignmentDetail(projectId),
    listEndedAssignments(projectId),
  ]);
  return {
    active: active ? toView(active, active.supervisor) : null,
    history: history.map((row) => toView(row, row.supervisor)),
  };
}

/** Writes load the project themselves (404 if missing — GET's guard did it). */
async function loadProject(projectId: string): Promise<ProjectRow> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new NotFoundError('Project');
  }
  return project;
}

/** Assign/change additionally require an active (not completed/archived) project. */
async function loadActiveProject(projectId: string): Promise<ProjectRow> {
  const project = await loadProject(projectId);
  if (project.status !== 'active') {
    throw new BusinessRuleError(`Cannot assign a supervisor to a ${project.status} project`);
  }
  return project;
}

/**
 * Target validation — a bad target must never reach the database:
 *   unknown id       → 400 (the request field references nothing)
 *   wrong role       → 422 (business rule, not a shape problem)
 *   deactivated user → 422 (cannot start a relationship with an inactive account)
 */
async function validateTargetSupervisor(supervisorId: string): Promise<UserRow> {
  const user = await findUserById(supervisorId);
  if (!user) {
    throw new ValidationError('Invalid supervisor', [
      { path: 'supervisorId', message: 'User not found' },
    ]);
  }
  if (user.role !== 'supervisor') {
    throw new BusinessRuleError('Target user is not a supervisor', [
      { path: 'supervisorId', message: 'Target user is not a supervisor' },
    ]);
  }
  if (!user.isActive) {
    throw new BusinessRuleError('Cannot assign a deactivated supervisor', [
      { path: 'supervisorId', message: 'Cannot assign a deactivated supervisor' },
    ]);
  }
  return user;
}

const ACTIVE_EXISTS = 'This project already has an active supervisor assignment';

/** POST — assign THE supervisor. At most one active row (409 + DB unique index). */
export async function assign(
  projectId: string,
  supervisorId: string,
  actorId: string,
): Promise<AssignmentView> {
  await loadActiveProject(projectId);

  const active = await findActiveAssignmentForProject(projectId);
  if (active) {
    throw new ConflictError(ACTIVE_EXISTS);
  }

  const supervisor = await validateTargetSupervisor(supervisorId);

  try {
    const row = await insertAssignment({
      projectId,
      supervisorId,
      isPrimary: true, // the single active assignment IS the primary
      assignedBy: actorId,
    });
    return toView(row, supervisor);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(ACTIVE_EXISTS); // lost the race — same truth
    }
    throw err;
  }
}

/**
 * PATCH — change the supervisor: END the current row and INSERT the next one
 * in a single transaction, so the history always shows who supervised when.
 * Rehiring a past supervisor is fine — only two ACTIVE rows are forbidden.
 */
export async function changeSupervisor(
  projectId: string,
  supervisorId: string,
  actorId: string,
): Promise<AssignmentView> {
  await loadActiveProject(projectId);

  const active = await findActiveAssignmentForProject(projectId);
  if (!active) {
    throw new ConflictError('This project has no active supervisor assignment to change');
  }
  if (active.supervisorId === supervisorId) {
    throw new ConflictError('This supervisor is already the active assignment');
  }

  const supervisor = await validateTargetSupervisor(supervisorId);

  let created: SupervisorAssignmentRow | undefined;
  try {
    created = await db.transaction(async (tx) => {
      // The loser of a race sees `ended === undefined` and commits nothing.
      const ended = await endAssignment(active.id, tx);
      if (!ended) {
        return undefined;
      }
      return insertAssignment(
        { projectId, supervisorId, isPrimary: true, assignedBy: actorId },
        tx,
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(ACTIVE_EXISTS);
    }
    throw err;
  }

  if (!created) {
    throw new ConflictError('This project has no active supervisor assignment to change');
  }
  return toView(created, supervisor);
}

/** DELETE — end the relationship (soft: endedAt set, the row becomes history). */
export async function end(projectId: string): Promise<AssignmentView> {
  await loadProject(projectId); // ending is allowed regardless of project status

  const active = await findActiveAssignmentDetail(projectId);
  if (!active) {
    throw new ConflictError('This project has no active supervisor assignment to end');
  }

  const ended = await endAssignment(active.id);
  if (!ended) {
    throw new ConflictError('This project has no active supervisor assignment to end');
  }
  return toView(ended, active.supervisor);
}
