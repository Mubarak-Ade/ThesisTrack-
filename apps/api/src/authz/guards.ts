import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { Role } from '../lib/roles.js';

/** Shared: the authenticated user, or401. Used by every guard in this layer. */
export function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) {
    throw new AuthenticationError();
  }
  return req.user;
}

/**
 * Layer 0 — authentication gate (defense in depth; the global `authenticate`
 * middleware normally ran already). Use it to make a route's requirement
 * explicit even when the handler itself is custom.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    requireUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Layer 1 — RBAC: role gate.
 *
 *   requireRole('student')             → only students
 *   requireRole('supervisor', 'administrator') → either role
 *   requireRole()                      → any authenticated user
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const user = requireUser(req);

      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new AuthorizationError(`Requires role: ${roles.join(' or ')}`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Administrator-only resources. */
export function requireAdmin(): RequestHandler {
  return requireRole('administrator');
}
