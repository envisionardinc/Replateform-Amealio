import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Minimal structured request-lifecycle logging (method, path, status, ms, requestId). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.write(req, res.statusCode, start),
        error: () => this.write(req, res.statusCode || 500, start),
      }),
    );
  }

  private write(req: Request & { requestId?: string }, status: number, start: number): void {
    const ms = Date.now() - start;
    this.logger.log(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status,
        ms,
      }),
    );
  }
}
