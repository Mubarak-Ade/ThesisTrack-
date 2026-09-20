import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/index.js';

type RequestSource = 'body' | 'params' | 'query';

export function validate(schema: ZodSchema, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        next(new ValidationError('Invalid request', details));
      } else {
        next(err);
      }
    }
  };
}
