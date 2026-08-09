import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { DataSource } from 'typeorm';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly httpErrorsTotal: Counter<string>;
  readonly httpActiveRequests: Gauge<string>;
  readonly ordersCreated: Counter<string>;
  readonly ordersProcessedSuccess: Counter<string>;
  readonly ordersProcessedFailure: Counter<string>;
  readonly orderProcessingDuration: Histogram<string>;
  readonly paymentRequestDuration: Histogram<string>;
  readonly paymentErrors: Counter<string>;
  readonly pgPoolTotal: Gauge<string>;
  readonly pgPoolIdle: Gauge<string>;
  readonly pgPoolWaiting: Gauge<string>;

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

    this.ordersProcessedSuccess = new Counter({
      name: 'orders_processed_success_total',
      help: 'Total number of orders processed successfully',
      registers: [this.registry],
    });

    this.ordersProcessedFailure = new Counter({
      name: 'orders_processed_failure_total',
      help: 'Total number of orders that failed during processing',
      registers: [this.registry],
    });

    this.orderProcessingDuration = new Histogram({
      name: 'order_processing_duration_seconds',
      help: 'Duration of order processing in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.paymentRequestDuration = new Histogram({
      name: 'payment_request_duration_seconds',
      help: 'Duration of payment service requests in seconds',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.paymentErrors = new Counter({
      name: 'payment_errors_total',
      help: 'Total number of payment errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    this.pgPoolTotal = new Gauge({
      name: 'pg_pool_total_connections',
      help: 'Total connections in the PostgreSQL pool',
      registers: [this.registry],
    });

    this.pgPoolIdle = new Gauge({
      name: 'pg_pool_idle_connections',
      help: 'Idle connections in the PostgreSQL pool',
      registers: [this.registry],
    });

    this.pgPoolWaiting = new Gauge({
      name: 'pg_pool_waiting_clients',
      help: 'Clients waiting for a PostgreSQL pool connection',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'nodejs_',
    });

    this.registry.setDefaultLabels({ service: 'order-service' });

    setInterval(() => this.collectPoolMetrics(), 5000).unref();
  }

  private collectPoolMetrics(): void {
    const driver = this.dataSource.driver as {
      master?: { totalCount?: number; idleCount?: number; waitingCount?: number };
    };
    const pool = driver.master;
    if (!pool) {
      return;
    }
    this.pgPoolTotal.set(pool.totalCount ?? 0);
    this.pgPoolIdle.set(pool.idleCount ?? 0);
    this.pgPoolWaiting.set(pool.waitingCount ?? 0);
  }

  async getMetrics(): Promise<string> {
    this.collectPoolMetrics();
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
