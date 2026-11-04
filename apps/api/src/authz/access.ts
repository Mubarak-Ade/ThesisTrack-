import type { AuthUser } from '../middleware/auth.js';
import { getActiveAssignment } from '../modules/supervisor-assignments/service.js';
import { findUserById } from '../modules/users/service.js';
import type { ProjectRow } from '../modules/projects/types.js';

export type ProjectAccess = 'owner' | 'supervisor' | 'coordinator' | 'admin';

/**
 * Core resource-authorization decision for projects:
 *
 * - administrator      → 'admin'       (administrative resources)
 * - project's student  → 'owner'       (own project only)
 * - coordinator        → 'coordinator' (the student is in their department)
 * - active assignment  → 'supervisor'  (assigned projects only)
 * - otherwise          → null          (no relationship)
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
  if (user.role === 'coordinator') {
    if (!user.departmentId) return null; // fail closed: no resolved scope
    const student = await findUserById(project.studentId);
    return student?.departmentId && student.departmentId === user.departmentId
      ? 'coordinator'
      : null;
  }

  const assignment = await getActiveAssignment(project.id, user.id);
  return assignment ? 'supervisor' : null;
}
