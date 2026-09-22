import { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../errors/index.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { Role } from '../lib/roles.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Endpoints that run without an access token.
 * Everything else — including GET /auth/me — requires `Authorization: Bearer <jwt>`.
 */
const PUBLIC_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/activate',
]);

/** Public prefixes — for routes with a dynamic token segment. */
const PUBLIC_PREFIXES = ['/api/v1/auth/invitation/'];

/**
 * Authentication stage: "who are you?" — verifies the short-lived access
 * token (JWT) and attaches `req.user`. Token expiry surfaces as a 401, which
 * triggers the client's refresh flow.
 *
 * Authorization ("what may you do?") lives in `src/authz/`.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.has(req.path) || PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AuthenticationError());
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    next(err instanceof AuthenticationError ? err : new AuthenticationError());
  }
}
