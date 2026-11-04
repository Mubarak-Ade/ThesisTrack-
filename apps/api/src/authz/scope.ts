import type { RequestHandler } from 'express';

import { AuthorizationError } from '../errors/index.js';
import { findUserById } from '../modules/users/service.js';
import type { AuthUser } from '../middleware/auth.js';
import { requireUser } from './guards.js';

/**
 * Department scope — design 2026-11-02 (ADR-17).
 *
 * Coordinators are scoped to exactly one department. The department is read
 * from the database on every request rather than from a JWT claim, so a
 * super-admin transfer takes effect immediately and a stale token can never
 * carry yesterday's scope.
 *
 * Administrators are institution-wide (`null` scope); students and supervisors
 * are unchanged — their resource guards own access.
 */
export function departmentScope(user: AuthUser): string | null {
  if (user.role !== 'coordinator') {
    return null;
  }
  if (!user.departmentId) {
    // Fail closed: a service reached without the guard must never behave like
    // an unscoped administrator.
    throw new AuthorizationError('Coordinator account has no department');
  }
  return user.departmentId;
}

/** True only when the actor is a coordinator whose resolved department matches. */
export function isCoordinatorInDepartment(
  user: AuthUser,
  departmentId: string | null | undefined,
): boolean {
  return (
    user.role === 'coordinator' &&
    Boolean(user.departmentId) &&
    Boolean(departmentId) &&
    user.departmentId === departmentId
  );
}

/**
 * Layer 1.5 — resolve the actor's department scope.
 *
 * - administrator → pass through, unrestricted;
 * - coordinator → load the current account, attach `departmentId`, 403 when
 *   the account/department cannot be resolved;
 * - student/supervisor → pass through (their resource guards decide).
 */
export function requireDepartmentScope(): RequestHandler {
  return (req, _res, next) => {
    const run = async () => {
      const user = requireUser(req);

      if (user.role !== 'coordinator') {
        next();
        return;
      }

      const account = await findUserById(user.id);
      if (!account || !account.isActive || !account.departmentId) {
        throw new AuthorizationError('Coordinator account has no department');
      }

      user.departmentId = account.departmentId;
      next();
    };

    run().catch(next);
  };
}
