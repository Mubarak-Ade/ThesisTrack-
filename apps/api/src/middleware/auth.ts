import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next(new AuthenticationError());
    return;
  }

  // TODO: Validate token against sessions table
  // For now, attach a placeholder user
  req.user = {
    id: 'placeholder-user-id',
    email: 'placeholder@example.com',
    role: 'student',
  };

  next();
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      next(new AuthorizationError());
      return;
    }

    next();
  };
}
