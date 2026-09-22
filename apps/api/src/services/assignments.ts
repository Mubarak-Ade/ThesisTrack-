import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../config/db.js';
import { supervisorAssignments } from '../schema/index.js';

export type SupervisorAssignmentRow = typeof supervisorAssignments.$inferSelect;

/** A supervisor may only act on projects whose assignment has not ended. */
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
