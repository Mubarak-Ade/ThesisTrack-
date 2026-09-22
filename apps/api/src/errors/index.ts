export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * Base class for every expected application error.
 * The global error handler serializes any `AppError` using the standard
 * error response shape:
 *   { success: false, error: { code, message, details? } }
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details: ErrorDetail[];

  constructor(message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

/** 400 — the request failed schema/shape validation. */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Validation failed', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

/** 401 — missing, malformed, or expired credentials. */
export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_ERROR';

  constructor(message = 'Authentication required') {
    super(message);
  }
}

/** 403 — authenticated but not allowed to perform this action. */
export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly code = 'AUTHORIZATION_ERROR';

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

/** 404 — the addressed resource does not exist. */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

/** 409 — conflicts with the current state of the resource (e.g. duplicates). */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'RESOURCE_CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

/** 422 — syntactically valid, but violates a domain/business rule. */
export class BusinessRuleError extends AppError {
  readonly statusCode = 422;
  readonly code = 'BUSINESS_RULE_VIOLATION';

  constructor(message: string, details: ErrorDetail[] = []) {
    super(message, details);
  }
}
