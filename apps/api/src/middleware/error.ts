import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/index.js';
import { respondError } from '../lib/response.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    respondError(res, err);
    return;
  }

  if (isAppError(err)) {
    respondError(res, err);
    return;
  }

  console.error(`Unhandled error: ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

function isAppError(err: Error): err is AppError {
  return (
    'statusCode' in err &&
    'code' in err &&
    typeof (err as AppError).statusCode === 'number' &&
    typeof (err as AppError).code === 'string'
  );
}
