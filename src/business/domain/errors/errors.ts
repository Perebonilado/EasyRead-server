import { ErrorCodes, type ErrorCode } from '../../../contracts';

/**
 * Domain errors carry a stable machine code. The web layer's exception filter
 * maps them to HTTP status codes, so business code never imports HTTP concepts.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(what = 'Resource') {
    super(ErrorCodes.NOT_FOUND, `${what} not found`, 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have access to this resource') {
    super(ErrorCodes.FORBIDDEN, message, 403);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(ErrorCodes.UNAUTHORIZED, message, 401);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    // Deliberately vague: never reveal whether the email exists.
    super(
      ErrorCodes.INVALID_CREDENTIALS,
      'That email and password do not match',
      401,
    );
  }
}

export class EmailInUseError extends DomainError {
  constructor() {
    super(ErrorCodes.EMAIL_IN_USE, 'That email is already registered', 409);
  }
}

export class InvalidTokenError extends DomainError {
  constructor(message = 'This link is not valid') {
    super(ErrorCodes.INVALID_TOKEN, message, 400);
  }
}

export class TokenExpiredError extends DomainError {
  constructor(message = 'This link has expired') {
    super(ErrorCodes.TOKEN_EXPIRED, message, 400);
  }
}

export class LimitReachedError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(ErrorCodes.LIMIT_REACHED, message, 402, details);
  }
}

export class UnsupportedFormatError extends DomainError {
  constructor(extension: string) {
    super(
      ErrorCodes.UNSUPPORTED_FORMAT,
      `We can't read .${extension} files yet`,
      415,
    );
  }
}

export class FileTooLargeError extends DomainError {
  constructor(maxBytes: number) {
    super(
      ErrorCodes.FILE_TOO_LARGE,
      `That file is over ${Math.round(maxBytes / 1024 / 1024)} MB`,
      413,
    );
  }
}

export class DocumentNotReadyError extends DomainError {
  constructor(message = 'This document is still being prepared') {
    super(ErrorCodes.DOC_NOT_READY, message, 409);
  }
}

export class AlreadyInProgressError extends DomainError {
  constructor(message = 'That is already running') {
    super(ErrorCodes.ALREADY_IN_PROGRESS, message, 409);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(ErrorCodes.VALIDATION_FAILED, message, 400, details);
  }
}
