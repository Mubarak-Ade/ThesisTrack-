import { Request, Response } from 'express';
import { NotFoundError } from '../errors/index.js';
import { respondError } from '../lib/response.js';

export function notFoundHandler(req: Request, res: Response): void {
  respondError(res, new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}
