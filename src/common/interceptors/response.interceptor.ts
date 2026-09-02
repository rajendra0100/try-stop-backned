import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Shape of every successful API response from this server.
 * All endpoints automatically return this wrapper.
 */
export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

/**
 * ResponseInterceptor — wraps every successful controller return value
 * in a standardized ApiResponse envelope.
 *
 * Error responses are handled by HttpExceptionFilter with the same shape
 * (success: false), giving you a fully consistent API contract.
 *
 * Usage: applied globally in main.ts via app.useGlobalInterceptors()
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse();

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode: response.statusCode,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
