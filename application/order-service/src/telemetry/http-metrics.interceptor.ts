import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/** Paths excluded from experimental HTTP workload metrics (probes + scrape + control). */
const EXCLUDED_PATH_PREFIXES = ['/health', '/metrics', '/remediation'];

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (this.isExcluded(request.path)) {
      return next.handle();
    }

    const method = request.method;
    const route = this.resolveRoute(request);
    const endTimer = this.metrics.httpRequestDuration.startTimer();
    this.metrics.httpActiveRequests.inc();

    return next.handle().pipe(
      tap(() => {
        const statusCode = String(response.statusCode);
        this.record(method, route, statusCode, endTimer);
      }),
      catchError((error: unknown) => {
        const statusCode = String(
          (error as { status?: number; statusCode?: number })?.status ??
            (error as { statusCode?: number })?.statusCode ??
            500,
        );
        this.record(method, route, statusCode, endTimer);
        return throwError(() => error);
      }),
      finalize(() => {
        this.metrics.httpActiveRequests.dec();
      }),
    );
  }

  private isExcluded(path: string): boolean {
    return EXCLUDED_PATH_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }

  private record(
    method: string,
    route: string,
    statusCode: string,
    endTimer: (labels?: Record<string, string | number>) => number,
  ): void {
    const labels = { method, route, status_code: statusCode };
    this.metrics.httpRequestsTotal.inc(labels);
    endTimer(labels);
    if (Number(statusCode) >= 400) {
      this.metrics.httpErrorsTotal.inc(labels);
    }
  }

  private resolveRoute(request: Request): string {
    const routePath = request.route?.path;
    if (typeof routePath === 'string') {
      const base = request.baseUrl ?? '';
      return `${base}${routePath}` || request.path;
    }
    return request.path.split('/').map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
        return ':id';
      }
      return segment;
    }).join('/') || '/';
  }
}
