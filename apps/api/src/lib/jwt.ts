import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticationError } from '../errors/index.js';
import { Role, ROLES } from './roles.js';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: Role;
  type: 'access';
}

export interface TokenUser {
  id: string;
  email: string;
  role: Role;
}

// jsonwebtoken is CommonJS: named ESM imports of it fail at runtime under
// NodeNext, so everything is accessed through the default (module.exports) import.

/** Access token: short-lived, sent in the `Authorization` header, never in a cookie. */
export function signAccessToken(user: TokenUser): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: string | object;

  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Access token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Access token is invalid');
    }
    throw err;
  }

  if (!isAccessTokenPayload(decoded)) {
    throw new AuthenticationError('Access token is invalid');
  }

  return decoded;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === 'access' &&
    typeof v.sub === 'string' &&
    typeof v.email === 'string' &&
    typeof v.role === 'string' &&
    (ROLES as readonly string[]).includes(v.role)
  );
}
