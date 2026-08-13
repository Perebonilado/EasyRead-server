import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCodes, type ApiError } from '../../contracts';
import { DomainError } from '../../business/domain/errors/errors';

/**
 * One error envelope for the whole API (§5).
 *
 * Domain errors already carry a status and a stable code; framework errors are
 * mapped onto the same shape so the client only ever parses one thing. Unknown
 * failures are logged with their stack and reported as a generic 500 — internal
 * messages never reach the client.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host
      .switchToHttp()
      .getRequest<{ method: string; url: string }>();

    // SSE responses have already started streaming; there's no envelope to send.
    if (response.headersSent) {
      response.end();
      return;
    }

    const body = this.toEnvelope(exception, request);
    response.status(this.statusOf(exception)).json(body);
  }

  private statusOf(exception: unknown): number {
    if (exception instanceof DomainError) return exception.status;
    if (exception instanceof HttpException) return exception.getStatus();
    return 500;
  }

  private toEnvelope(
    exception: unknown,
    request: { method: string; url: string },
  ): ApiError {
    if (exception instanceof DomainError) {
      return {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      // class-validator's pipe reports as a 400 with a `message` array.
      const details =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? payload.message
          : undefined;

      return {
        error: {
          code: this.codeForStatus(status),
          message: Array.isArray(details)
            ? String(details[0])
            : exception.message,
          details: Array.isArray(details) ? details : undefined,
        },
      };
    }

    this.logger.error(
      `Unhandled error on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our end',
      },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 401:
        return ErrorCodes.UNAUTHORIZED;
      case 403:
        return ErrorCodes.FORBIDDEN;
      case 404:
        return ErrorCodes.NOT_FOUND;
      case 413:
        return ErrorCodes.FILE_TOO_LARGE;
      case 415:
        return ErrorCodes.UNSUPPORTED_FORMAT;
      case 400:
      case 422:
        return ErrorCodes.VALIDATION_FAILED;
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
