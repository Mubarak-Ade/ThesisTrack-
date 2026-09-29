import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { supervisorAssignments } from '../../schema/index.js';
import type { UserRow } from '../users/types.js';
import type { AssignmentWithSupervisor, SupervisorAssignmentRow } from './types.js';

/**
 * Optional executor: multi-statement units (change = end + insert) run
 * inside the caller's transaction.
 */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update'>;

/** The project+supervisor pair's current active assignment (authz guard input). */
export async function findActiveAssignment(
  projectId: string,
  supervisorId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      eq(supervisorAssignments.supervisorId, supervisorId),
      isNull(supervisorAssignments.endedAt),
    ),
  });
}

/**
 * ANY active assignment for this student — **the conflict guard** (spec §6.2
 * corollary / I13). Keyed on `student_id` and nothing else: a `supervisor_id`
 * check would forbid a supervisor taking a second student, and a `project_id`
 * check would miss a student whose assignment predates their project (§13.3).
 */
export async function findActiveAssignmentForStudent(
  studentId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.studentId, studentId),
      isNull(supervisorAssignments.endedAt),
    ),
  });
}

/**
 * The (student, supervisor) pair's active row — **the authorization lookup**
 * (spec §13.3). Answers "does THIS supervisor actively supervise THIS student?"
 * and works whether or not a project exists yet.
 */
export async function findActiveAssignmentForStudentSupervisor(
  studentId: string,
  supervisorId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.studentId, studentId),
      eq(supervisorAssignments.supervisorId, supervisorId),
      isNull(supervisorAssignments.endedAt),
    ),
  });
}

/**
 * A supervisor's whole caseload: every ACTIVE row, student joined. Already one
 * row per student — I13 makes that a database fact rather than a dedupe.
 */
export async function listActiveAssignmentsForSupervisor(
  supervisorId: string,
): Promise<Array<SupervisorAssignmentRow & { student: UserRow }>> {
  return db.query.supervisorAssignments.findMany({
    where: and(
      eq(supervisorAssignments.supervisorId, supervisorId),
      isNull(supervisorAssignments.endedAt),
    ),
    orderBy: [desc(supervisorAssignments.assignedAt)],
    with: { student: true },
  });
}

/** The student's active assignment joined with its supervisor (for responses). */
export async function findActiveAssignmentDetailForStudent(
  studentId: string,
): Promise<AssignmentWithSupervisor | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.studentId, studentId),
      isNull(supervisorAssignments.endedAt),
    ),
    with: { supervisor: true },
  });
}

/** The student's ended assignments (history), most recently started first. */
export async function listEndedAssignmentsForStudent(
  studentId: string,
): Promise<AssignmentWithSupervisor[]> {
  return db.query.supervisorAssignments.findMany({
    where: and(
      eq(supervisorAssignments.studentId, studentId),
      isNotNull(supervisorAssignments.endedAt),
    ),
    orderBy: [desc(supervisorAssignments.assignedAt), desc(supervisorAssignments.id)],
    with: { supervisor: true },
  });
}

/** Active assignment joined with the supervisor's user row (for responses). */
export async function findActiveAssignmentDetail(
  projectId: string,
): Promise<AssignmentWithSupervisor | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      isNull(supervisorAssignments.endedAt),
    ),
    with: { supervisor: true },
  });
}

/** Ended assignments (history), most recently started first, supervisor joined. */
export async function listEndedAssignments(projectId: string): Promise<AssignmentWithSupervisor[]> {
  return db.query.supervisorAssignments.findMany({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      isNotNull(supervisorAssignments.endedAt),
    ),
    orderBy: [desc(supervisorAssignments.assignedAt), desc(supervisorAssignments.id)],
    with: { supervisor: true },
  });
}

export async function insertAssignment(
  values: typeof supervisorAssignments.$inferInsert,
  executor: WriteExecutor = db,
): Promise<SupervisorAssignmentRow> {
  const [created] = await executor.insert(supervisorAssignments).values(values).returning();
  return created;
}

/**
 * Ends an assignment (soft — the row becomes history). Single-use like the
 * session guards: only a still-active row flips, so racing changes cannot
 * both "win" (the loser sees undefined → 409).
 */
export async function endAssignment(
  id: string,
  executor: WriteExecutor = db,
): Promise<SupervisorAssignmentRow | undefined> {
  const [ended] = await executor
    .update(supervisorAssignments)
    .set({ endedAt: new Date() })
    .where(and(eq(supervisorAssignments.id, id), isNull(supervisorAssignments.endedAt)))
    .returning();
  return ended;
}
