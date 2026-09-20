import { Response } from 'express';
import { AppError, ValidationError } from '../errors/index.js';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export function respond<T>(res: Response, statusCode: number, data: T): void {
  const body: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

export function respondError(res: Response, error: AppError): void {
  const body: ErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error instanceof ValidationError && error.details.length > 0) {
    body.error.details = error.details;
  }

  res.status(error.statusCode).json(body);
}
