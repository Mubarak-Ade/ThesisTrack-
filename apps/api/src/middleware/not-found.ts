import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/index.js';

/**
 * Falls through for any request that matched no route, delegating to the
 * standard error handler so 404s use the same error envelope as everything else.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}
