import { findActiveAssignment as findActiveAssignmentRow, findProjectById } from './repository.js';
import type { ProjectRow, SupervisorAssignmentRow } from './types.js';

/** Business-layer entry point for fetching a project (validates id shape). */
export function getProjectById(id: string): Promise<ProjectRow | undefined> {
  return findProjectById(id);
}

/** Active (not ended) supervisor assignment for a project, if any. */
export function getActiveAssignment(
  projectId: string,
  supervisorId: string,
): Promise<SupervisorAssignmentRow | undefined> {
  return findActiveAssignmentRow(projectId, supervisorId);
}
