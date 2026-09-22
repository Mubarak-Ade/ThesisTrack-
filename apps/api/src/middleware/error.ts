import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/index.js';
import { respondError, ErrorResponse } from '../lib/response.js';

/**
 * Final stage of the middleware chain. Must be registered last.
 * Known `AppError`s are serialized with the standard error envelope;
 * anything else becomes a generic INTERNAL_SERVER_ERROR.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError = normalizeError(err);

  if (appError) {
    if (appError.statusCode >= 500) {
      console.error(`[${appError.code}] ${req.method} ${req.originalUrl}`, err);
    }
    respondError(res, appError);
    return;
  }

  console.error(`Unhandled error: ${req.method} ${req.originalUrl}`, err);
  const body: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  };
  res.status(500).json(body);
}

interface BodyParserError extends SyntaxError {
  type?: string;
}

/** Maps framework errors (JSON parse failures, oversized payloads) onto AppErrors. */
function normalizeError(err: unknown): AppError | undefined {
  if (err instanceof AppError) {
    return err;
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new ValidationError('Request body is not valid JSON', [
        { path: '', message: 'Malformed JSON payload' },
      ]);
    }
    if (err.type === 'entity.too.large') {
      return new ValidationError('Request body is too large', [
        { path: '', message: 'Payload exceeds the configured size limit' },
      ]);
    }
  }

  return undefined;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return err instanceof SyntaxError && 'type' in err;
}
