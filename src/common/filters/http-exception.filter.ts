import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * HttpExceptionFilter — global error handler.
 *
 * Normalises ALL errors (HTTP exceptions, MongoDB errors, unexpected crashes)
 * into a consistent error response envelope that mirrors the ResponseInterceptor shape.
 *
 * Every error response looks like:
 * {
 *   "success": false,
 *   "statusCode": 400,
 *   "message": "Human-readable error description",
 *   "errors": [...] // only present for validation errors (array of field messages)
 *   "timestamp": "2026-01-01T00:00:00.000Z"
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred. Please try again.';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const body = exceptionResponse as Record<string, any>;
        // class-validator returns message as an array of strings
        if (Array.isArray(body.message)) {
          message = 'Validation failed';
          errors = body.message;
        } else {
          message = body.message ?? exception.message;
        }
      }
    } else if (this.isMongooseDuplicateKeyError(exception)) {
      status = HttpStatus.CONFLICT;
      const keys = Object.keys((exception as any).keyValue ?? {});
      message = `${keys.join(', ')} already exists`;
    } else if (exception instanceof Error) {
      // Log unexpected errors with stack trace, but don't leak internals to clients
      this.logger.error(exception.message, exception.stack);
      message = 'An unexpected error occurred. Please try again.';
    }

    const errorBody: Record<string, unknown> = {
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errors) {
      errorBody.errors = errors;
    }

    response.status(status).json(errorBody);
  }

  /** Type guard for MongoDB duplicate key error (code 11000) */
  private isMongooseDuplicateKeyError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as any).code === 11000
    );
  }
}
