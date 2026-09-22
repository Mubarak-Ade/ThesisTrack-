import type { AuthUser } from '../middleware/auth.js';
import { findActiveAssignment } from '../services/assignments.js';
import type { ProjectRow } from '../services/projects.js';

export type ProjectAccess = 'owner' | 'supervisor' | 'admin';

/**
 * Core resource-authorization decision for projects:
 *
 * - administrator      → 'admin'      (administrative resources)
 * - project's student  → 'owner'      (own project only)
 * - active assignment  → 'supervisor' (assigned projects only)
 * - otherwise          → null         (no relationship)
 *
 * Pure service — usable from guards, services, and handlers alike.
 */
export async function getProjectAccess(
  user: AuthUser,
  project: ProjectRow,
): Promise<ProjectAccess | null> {
  if (user.role === 'administrator') {
    return 'admin';
  }
  if (project.studentId === user.id) {
    return 'owner';
  }

  const assignment = await findActiveAssignment(project.id, user.id);
  return assignment ? 'supervisor' : null;
}
