import { monitorEventLoopDelay } from 'perf_hooks';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * Payment-service research telemetry.
 * Percentiles (p50/p95/p99) are computed in Prometheus from histograms — never in-process.
 */
export class PaymentMetrics {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly httpErrorsTotal: Counter<string>;
  readonly httpActiveRequests: Gauge<string>;
  readonly paymentRequestsTotal: Counter<string>;
  readonly eventLoopDelaySeconds: Histogram<string>;

  private readonly eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });

  constructor() {
    this.registry.setDefaultLabels({ service: 'payment-service' });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP workload requests (excludes health/metrics)',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds (server-side; excludes health/metrics)',
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
      help: 'Number of HTTP workload requests currently being processed',
      registers: [this.registry],
    });

    this.paymentRequestsTotal = new Counter({
      name: 'payment_requests_total',
      help: 'Payment processing attempts by result (payment-service perspective)',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.eventLoopDelaySeconds = new Histogram({
      name: 'nodejs_eventloop_delay_seconds',
      help: 'Node.js event loop delay sampled via perf_hooks.monitorEventLoopDelay',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [this.registry],
    });

    collectDefaultMetrics({ register: this.registry });
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

    this.eventLoopMonitor.enable();
    setInterval(() => this.collectEventLoopDelay(), 5000).unref();
  }

  private collectEventLoopDelay(): void {
    const meanSeconds = this.eventLoopMonitor.mean / 1e9;
    if (Number.isFinite(meanSeconds) && meanSeconds >= 0) {
      this.eventLoopDelaySeconds.observe(meanSeconds);
    }
    this.eventLoopMonitor.reset();
  }

  async metricsText(): Promise<string> {
    this.collectEventLoopDelay();
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
