import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { supervisorAssignments } from '../../schema/index.js';
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

/** The project's single active assignment (the DB backs this with a unique index). */
export async function findActiveAssignmentForProject(
  projectId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return db.query.supervisorAssignments.findFirst({
    where: and(
      eq(supervisorAssignments.projectId, projectId),
      isNull(supervisorAssignments.endedAt),
    ),
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
