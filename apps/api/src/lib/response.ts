import { Response } from 'express';
import { AppError } from '../errors/index.js';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

/** Standard success envelope: `{ success: true, data }`. */
export function respond<T>(res: Response, statusCode: number, data: T): void {
  const body: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

/** Standard error envelope: `{ success: false, error: { code, message, details? } }`. */
export function respondError(res: Response, error: AppError): void {
  const body: ErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.details.length > 0) {
    body.error.details = error.details;
  }

  res.status(error.statusCode).json(body);
}
