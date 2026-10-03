import { eq } from 'drizzle-orm';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../errors/index.js';
import { db } from '../../config/db.js';
import { notify } from '../../lib/notify.js';
import { getProjectById } from '../projects/service.js';
import { findUserById, toPublicUser } from '../users/service.js';
import { projects } from '../../schema/index.js';
import type { ProjectRow } from '../projects/types.js';
import type { UserRow } from '../users/types.js';
import {
  endAssignment,
  findActiveAssignment,
  findActiveAssignmentDetail,
  findActiveAssignmentDetailForStudent,
  findActiveAssignmentForStudent,
  findActiveAssignmentForStudentSupervisor,
  insertAssignment,
  listActiveAssignmentsForSupervisor,
  listEndedAssignments,
  listEndedAssignmentsForStudent,
} from './repository.js';
import type {
  AssignmentOverview,
  AssignmentView,
  CaseloadEntry,
  SupervisorAssignmentRow,
} from './types.js';

/** Postgres unique_violation — the active-assignment DB backstop (race lost). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * Entry point for the authz layer (moved here from modules/projects —
 * an assignment row describes THIS module's entity, not the project's).
 *
 * Project-keyed, and deliberately so: project-scoped guards keep working
 * unchanged because §5.4 back-fills `project_id` (§13.3). Anything that must
 * work *before* a project exists uses `getActiveAssignmentForStudent`.
 */
export function getActiveAssignment(
  projectId: string,
  supervisorId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return findActiveAssignment(projectId, supervisorId);
}

/** Spec §13.3 — "does this supervisor actively supervise THIS student?" */
export function getActiveAssignmentForStudent(
  studentId: string,
  supervisorId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return findActiveAssignmentForStudentSupervisor(studentId, supervisorId);
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

/**
 * §15.2 recipient resolution — the student's active supervisor, or null.
 *
 * A **service-level** read: ADR-02 lets modules import each other's *services*
 * (never their repositories), so submissions, reviews, feedback and milestones
 * can resolve this counterparty **before** their transaction and write the
 * state change and its notification as one unit (§15.4).
 */
export async function findActiveSupervisorIdForStudent(
  studentId: string,
): Promise<string | null> {
  const row = await findActiveAssignmentForStudent(studentId);
  return row?.supervisorId ?? null;
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

/** GET — same shape, resolved through the student (works with a null project). */
export async function getStudentAssignmentOverview(
  studentId: string,
): Promise<AssignmentOverview> {
  const [active, history] = await Promise.all([
    findActiveAssignmentDetailForStudent(studentId),
    listEndedAssignmentsForStudent(studentId),
  ]);
  return {
    active: active ? toView(active, active.supervisor) : null,
    history: history.map((row) => toView(row, row.supervisor)),
  };
}

/**
 * GET /supervisors/me/students — the caseload. One row per student, N rows for
 * N students: I13 bounds each student to a single active row, so nothing here
 * can repeat a student.
 */
export async function getCaseload(supervisorId: string): Promise<CaseloadEntry[]> {
  const rows = await listActiveAssignmentsForSupervisor(supervisorId);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    assignedAt: row.assignedAt,
    isPrimary: row.isPrimary,
    student: toPublicUser(row.student),
  }));
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
 * The target of `/students/:studentId/...`.
 *
 * Both "no such user" and "that user is not a student" are **404**, not 422:
 * the path parameter addresses a *student resource*, and there is no student
 * resource at an id belonging to a supervisor. This keeps the read guard and
 * the write path answering identically for the same id.
 */
async function loadStudent(studentId: string): Promise<UserRow> {
  const user = await findUserById(studentId);
  if (!user || user.role !== 'student') {
    throw new NotFoundError('Student');
  }
  return user;
}

/**
 * The student's project, if one exists yet.
 *
 * Called only on the `/students/...` path, where the caller has no `projectId`
 * to offer. Binding it keeps `GET /projects/:id/supervisor` and
 * `GET /students/:id/supervisor` in agreement; a student who has not been
 * approved yet correctly stays `null` (ADR-13 — assignment before project).
 */
async function resolveProjectForStudent(studentId: string): Promise<string | null> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.studentId, studentId),
  });
  return project?.id ?? null;
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

/*
 * Conflict messages — all four name the STUDENT.
 *
 * They used to read "This project already has …". After §8.2 the constraint is
 * per student (I13), so naming the project would be both wrong and misleading:
 * the student being rejected may have no project at all yet.
 */
const ACTIVE_EXISTS = 'This student already has an active supervisor';
const NO_ACTIVE_TO_CHANGE = 'This student has no active supervisor assignment to change';
const NO_ACTIVE_TO_END = 'This student has no active supervisor assignment to end';
const ALREADY_SUPERVISING = 'This supervisor already supervises this student';

/** POST — assign THE supervisor. At most one active row (409 + DB unique index). */
export async function assign(
  projectId: string,
  supervisorId: string,
  actorId: string,
): Promise<AssignmentView> {
  const project = await loadActiveProject(projectId);
  return assignToStudent(project.studentId, supervisorId, actorId, projectId);
}

/**
 * The student-keyed core every assign path funnels through.
 * `projectId` is supplied by the project route and resolved from the student
 * by the `/students/...` route.
 */
export async function assignToStudent(
  studentId: string,
  supervisorId: string,
  actorId: string,
  projectId: string | null = null,
): Promise<AssignmentView> {
  // The conflict test is per STUDENT — not per project, not per supervisor.
  const active = await findActiveAssignmentForStudent(studentId);
  if (active) {
    throw new ConflictError(ACTIVE_EXISTS);
  }

  const supervisor = await validateTargetSupervisor(supervisorId);

  try {
    const created = await db.transaction(async (tx) => {
      const row = await insertAssignment(
        {
          studentId,
          projectId,
          supervisorId,
          isPrimary: true, // the single active assignment IS the primary
          assignedBy: actorId,
        },
        tx,
      );
      // §15.2 "Supervisor assigned → student + supervisor", written in the
      // assignment's own transaction (§15.4): both rows or neither.
      await notify(
        {
          userId: studentId,
          type: 'assignment',
          title: 'Supervisor assigned',
          message: `You have been assigned ${supervisor.firstName} ${supervisor.lastName} as your supervisor.`,
          resourceType: 'assignment',
          resourceId: row.id,
        },
        tx,
      );
      await notify(
        {
          userId: supervisorId,
          type: 'assignment',
          title: 'Supervisor assigned',
          message: 'A student has been assigned to you for supervision.',
          resourceType: 'assignment',
          resourceId: row.id,
        },
        tx,
      );
      return row;
    });
    return toView(created, supervisor);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(ACTIVE_EXISTS); // lost the race — same truth
    }
    throw err;
  }
}

/** POST /students/:studentId/supervisor — admin; resolves the project itself. */
export async function assignToStudentFromStudentParam(
  studentId: string,
  supervisorId: string,
  actorId: string,
): Promise<AssignmentView> {
  await loadStudent(studentId);
  const projectId = await resolveProjectForStudent(studentId);
  return assignToStudent(studentId, supervisorId, actorId, projectId);
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
  const project = await loadActiveProject(projectId);
  return changeSupervisorForStudent(project.studentId, supervisorId, actorId, projectId);
}

export async function changeSupervisorForStudent(
  studentId: string,
  supervisorId: string,
  actorId: string,
  projectId: string | null = null,
): Promise<AssignmentView> {
  const active = await findActiveAssignmentForStudent(studentId);
  if (!active) {
    throw new ConflictError(NO_ACTIVE_TO_CHANGE);
  }
  if (active.supervisorId === supervisorId) {
    throw new ConflictError(ALREADY_SUPERVISING);
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
      const row = await insertAssignment(
        {
          studentId,
          // Keep the project the row already had unless the caller pinned one.
          projectId: projectId ?? active.projectId,
          supervisorId,
          isPrimary: true,
          assignedBy: actorId,
        },
        tx,
      );
      // §15.2's assignment trigger again — a change is a fresh assignment for
      // the student and the NEW supervisor, inside the same unit (§15.4).
      // The outgoing supervisor is deliberately silent: §15.2 has no row for
      // an ended relationship (history preserves it, I12).
      await notify(
        {
          userId: studentId,
          type: 'assignment',
          title: 'Supervisor changed',
          message: `Your supervisor is now ${supervisor.firstName} ${supervisor.lastName}.`,
          resourceType: 'assignment',
          resourceId: row.id,
        },
        tx,
      );
      await notify(
        {
          userId: supervisorId,
          type: 'assignment',
          title: 'Supervisor changed',
          message: 'You are now supervising this student.',
          resourceType: 'assignment',
          resourceId: row.id,
        },
        tx,
      );
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(ACTIVE_EXISTS);
    }
    throw err;
  }

  if (!created) {
    throw new ConflictError(NO_ACTIVE_TO_CHANGE);
  }
  return toView(created, supervisor);
}

/** PATCH /students/:studentId/supervisor — admin; resolves the project itself. */
export async function changeSupervisorFromStudentParam(
  studentId: string,
  supervisorId: string,
  actorId: string,
): Promise<AssignmentView> {
  await loadStudent(studentId);
  const projectId = await resolveProjectForStudent(studentId);
  return changeSupervisorForStudent(studentId, supervisorId, actorId, projectId);
}

/** DELETE — end the relationship (soft: endedAt set, the row becomes history). */
export async function end(projectId: string): Promise<AssignmentView> {
  const project = await loadProject(projectId); // 404 if missing; status is irrelevant here
  return endForStudent(project.studentId);
}

export async function endForStudent(studentId: string): Promise<AssignmentView> {
  const active = await findActiveAssignmentDetailForStudent(studentId);
  if (!active) {
    throw new ConflictError(NO_ACTIVE_TO_END);
  }

  const ended = await endAssignment(active.id);
  if (!ended) {
    throw new ConflictError(NO_ACTIVE_TO_END);
  }
  return toView(ended, active.supervisor);
}

/** DELETE /students/:studentId/supervisor — admin; 404 if there is no such student. */
export async function endFromStudentParam(studentId: string): Promise<AssignmentView> {
  await loadStudent(studentId);
  return endForStudent(studentId);
}
