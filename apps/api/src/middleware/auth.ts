import { Request, Response, NextFunction } from 'express';
import { API_PREFIX } from '../config/paths.js';
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
 *
 * Suffixes are spelled without the mount prefix and joined to `API_PREFIX`
 * here, so the allowlist cannot drift from the routes.ts mount (plan 15.6).
 */
const PUBLIC_PATHS = new Set(
  [
    '/health',
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/activate',
  ].map((suffix) => `${API_PREFIX}${suffix}`),
);

/** Public prefixes — for routes with a dynamic token segment. */
const PUBLIC_PREFIXES = [`${API_PREFIX}/auth/invitation/`];

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
