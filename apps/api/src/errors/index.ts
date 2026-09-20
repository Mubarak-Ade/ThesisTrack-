export interface ErrorDetail {
  path: string;
  message: string;
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  readonly details: ErrorDetail[];

  constructor(message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class AuthenticationError extends Error {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_ERROR';

  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  readonly statusCode = 403;
  readonly code = 'AUTHORIZATION_ERROR';

  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'RESOURCE_CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class BusinessRuleError extends Error {
  readonly statusCode = 422;
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BusinessRuleError';
    this.details = details;
  }
}

export type AppError =
  | ValidationError
  | AuthenticationError
  | AuthorizationError
  | NotFoundError
  | ConflictError
  | BusinessRuleError;
