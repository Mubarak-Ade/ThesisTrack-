import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { projects, supervisorAssignments } from '../../schema/index.js';
import type { ProjectRow, SupervisorAssignmentRow } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Returns undefined for unknown *and* malformed ids (never reaches Postgres). */
export async function findProjectById(id: string): Promise<ProjectRow | undefined> {
  if (!isValidUuid(id)) return undefined;
  return db.query.projects.findFirst({ where: eq(projects.id, id) });
}

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
