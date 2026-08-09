import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { DataSource } from 'typeorm';
import { monitorEventLoopDelay } from 'perf_hooks';

/**
 * Research telemetry for Phase 1.5.
 *
 * Histogram buckets are sized for backend API latencies (ms → multi-second).
 * Percentiles (p50/p95/p99) must be computed by Prometheus from these buckets —
 * the application does not pre-calculate them.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly httpErrorsTotal: Counter<string>;
  readonly httpActiveRequests: Gauge<string>;
  readonly ordersCreated: Counter<string>;
  readonly ordersProcessingTotal: Counter<string>;
  readonly orderProcessingDuration: Histogram<string>;
  readonly paymentRequestsTotal: Counter<string>;
  readonly paymentRequestDuration: Histogram<string>;
  readonly databasePoolActiveConnections: Gauge<string>;
  readonly databasePoolIdleConnections: Gauge<string>;
  readonly databasePoolWaitingRequests: Gauge<string>;
  readonly eventLoopDelaySeconds: Histogram<string>;

  private readonly eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });

  constructor(private readonly dataSource: DataSource) {
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpErrorsTotal = new Counter({
      name: 'http_errors_total',
      help: 'Total number of HTTP error responses (status >= 400)',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpActiveRequests = new Gauge({
      name: 'http_active_requests',
      help: 'Number of HTTP requests currently being processed',
      registers: [this.registry],
    });

    this.ordersCreated = new Counter({
      name: 'orders_created_total',
      help: 'Total number of orders created',
      registers: [this.registry],
    });

    this.ordersProcessingTotal = new Counter({
      name: 'orders_processing_total',
      help: 'Total number of order processing attempts by result',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.orderProcessingDuration = new Histogram({
      name: 'order_processing_duration_seconds',
      help: 'Duration of order processing in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.paymentRequestsTotal = new Counter({
      name: 'payment_requests_total',
      help: 'Total number of payment service requests by result',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.paymentRequestDuration = new Histogram({
      name: 'payment_request_duration_seconds',
      help: 'Duration of payment service requests in seconds',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.databasePoolActiveConnections = new Gauge({
      name: 'database_pool_active_connections',
      help: 'Active (checked-out) connections in the PostgreSQL pool',
      registers: [this.registry],
    });

    this.databasePoolIdleConnections = new Gauge({
      name: 'database_pool_idle_connections',
      help: 'Idle connections in the PostgreSQL pool',
      registers: [this.registry],
    });

    this.databasePoolWaitingRequests = new Gauge({
      name: 'database_pool_waiting_requests',
      help: 'Requests waiting for a PostgreSQL pool connection',
      registers: [this.registry],
    });

    this.eventLoopDelaySeconds = new Histogram({
      name: 'nodejs_eventloop_delay_seconds',
      help: 'Node.js event loop delay sampled via perf_hooks.monitorEventLoopDelay',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    // Standard process/CPU/memory/GC metrics from prom-client.
    // Intentionally omit eventLoopLag gauges (incl. in-process p50/p90/p99):
    // nodejs_eventloop_delay_seconds Histogram is the canonical event-loop metric;
    // percentiles are computed in Prometheus via histogram_quantile.
    collectDefaultMetrics({
      register: this.registry,
    });
    for (const name of [
      'nodejs_eventloop_lag_seconds',
      'nodejs_eventloop_lag_min_seconds',
      'nodejs_eventloop_lag_max_seconds',
      'nodejs_eventloop_lag_mean_seconds',
      'nodejs_eventloop_lag_stddev_seconds',
      'nodejs_eventloop_lag_p50_seconds',
      'nodejs_eventloop_lag_p90_seconds',
      'nodejs_eventloop_lag_p99_seconds',
    ]) {
      this.registry.removeSingleMetric(name);
    }

    this.registry.setDefaultLabels({ service: 'order-service' });

    this.eventLoopMonitor.enable();
    setInterval(() => {
      this.collectPoolMetrics();
      this.collectEventLoopDelay();
    }, 5000).unref();
  }

  private collectPoolMetrics(): void {
    const driver = this.dataSource.driver as {
      master?: { totalCount?: number; idleCount?: number; waitingCount?: number };
    };
    const pool = driver.master;
    if (!pool) {
      return;
    }
    const total = pool.totalCount ?? 0;
    const idle = pool.idleCount ?? 0;
    const waiting = pool.waitingCount ?? 0;
    this.databasePoolActiveConnections.set(Math.max(total - idle, 0));
    this.databasePoolIdleConnections.set(idle);
    this.databasePoolWaitingRequests.set(waiting);
  }

  private collectEventLoopDelay(): void {
    // mean is in nanoseconds
    const meanSeconds = this.eventLoopMonitor.mean / 1e9;
    if (Number.isFinite(meanSeconds) && meanSeconds >= 0) {
      this.eventLoopDelaySeconds.observe(meanSeconds);
    }
    this.eventLoopMonitor.reset();
  }

  async getMetrics(): Promise<string> {
    this.collectPoolMetrics();
    this.collectEventLoopDelay();
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
