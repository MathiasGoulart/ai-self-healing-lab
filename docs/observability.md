# Observability model (research telemetry)

Phase 1.5 establishes the **metrics baseline** for later comparative experiments. The experimental subject remains the Order Processing Service; telemetry is first-class and Prometheus-compatible.

## Surfaces

| Signal | How |
|--------|-----|
| Metrics | `GET /metrics` (Prometheus text exposition) |
| Logs | Structured JSON on stdout (`requestId`, event names, optional `traceId`/`spanId`) |
| Traces | OpenTelemetry (OTLP if configured; otherwise console exporter) |

This document focuses on **metrics** used as experiment outcomes.

## Design rules

1. Low-cardinality labels only (`method`, `route`, `status_code`, `result`). Never `order_id`, `request_id`, or raw URLs.
2. Histograms expose buckets; **Prometheus** computes p50/p95/p99 via `histogram_quantile`.
3. Prefer standard Node.js/process metrics from `prom-client` for CPU, memory, and event-loop lag.
4. Application-specific metrics cover order processing, payment dependency, and DB pool state (needed for future fault scenarios).

## Metric catalog

### Throughput & HTTP errors

| Metric | Type | Labels | Use |
|--------|------|--------|-----|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Throughput, error rate |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Latency percentiles |
| `http_errors_total` | Counter | `method`, `route`, `status_code` | Convenience error counter (≥400) |
| `http_active_requests` | Gauge | — | In-flight requests |

**Throughput**

```promql
sum(rate(http_requests_total{service="order-service"}[1m]))
```

**Error rate (5xx)**

```promql
sum(rate(http_requests_total{service="order-service",status_code=~"5.."}[5m]))
/
sum(rate(http_requests_total{service="order-service"}[5m]))
```

**Latency p50 / p95 / p99**

```promql
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m])))
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m])))
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m])))
```

Buckets (seconds): `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`.

### Orders

| Metric | Type | Labels | Use |
|--------|------|--------|-----|
| `orders_created_total` | Counter | — | Create-order volume |
| `orders_processing_total` | Counter | `result=success\|failure` | Processing outcomes |
| `order_processing_duration_seconds` | Histogram | — | End-to-end process latency |

### Payment dependency

| Metric | Type | Labels | Use |
|--------|------|--------|-----|
| `payment_request_duration_seconds` | Histogram | — | Payment latency percentiles |
| `payment_requests_total` | Counter | `result=success\|error\|declined` | Payment success/error rate |

```promql
histogram_quantile(0.95, sum by (le) (rate(payment_request_duration_seconds_bucket{service="order-service"}[5m])))
sum(rate(payment_requests_total{service="order-service",result!="success"}[5m]))
```

### Database pool (future connection-exhaustion faults)

| Metric | Type | Meaning |
|--------|------|---------|
| `database_pool_active_connections` | Gauge | Checked-out connections (`total - idle`) |
| `database_pool_idle_connections` | Gauge | Idle pool connections |
| `database_pool_waiting_requests` | Gauge | Clients waiting for a connection |

### CPU

| Metric | Notes |
|--------|-------|
| `process_cpu_seconds_total` | Cumulative CPU time (user+system). Use `rate()` for usage. |
| `process_cpu_user_seconds_total` | User CPU |
| `process_cpu_system_seconds_total` | System CPU |

```promql
rate(process_cpu_seconds_total{service="order-service"}[1m])
```

### Memory

| Metric | Notes |
|--------|-------|
| `process_resident_memory_bytes` | RSS |
| `nodejs_heap_size_used_bytes` | V8 heap used |
| `nodejs_heap_size_total_bytes` | V8 heap total |

### Event loop

| Metric | Notes |
|--------|-------|
| `nodejs_eventloop_delay_seconds` | Custom histogram from `perf_hooks.monitorEventLoopDelay` (mean sampled every ~5s) |
| `nodejs_eventloop_lag_seconds` | Gauge from `prom-client` defaults |
| `nodejs_eventloop_lag_p50_seconds` / `_p90_` / `_p99_` | Lag percentiles from `prom-client` |

Rising event-loop lag with high CPU (or without) indicates blocking/saturation — relevant for future fault scenarios.

```promql
nodejs_eventloop_lag_p99_seconds{service="order-service"}
rate(nodejs_eventloop_delay_seconds_sum{service="order-service"}[5m])
/
rate(nodejs_eventloop_delay_seconds_count{service="order-service"}[5m])
```

## Kubernetes annotations

`order-service` pods are annotated for optional Prometheus discovery:

```text
prometheus.io/scrape: "true"
prometheus.io/port: "3000"
prometheus.io/path: /metrics
```

Phase 1.5 does not require deploying Prometheus; scrape configuration is documented under `infrastructure/k3s/README.md`.

## What is intentionally absent

- Pre-computed p50/p95/p99 gauges in the app
- High-cardinality labels
- Separate metrics API
- AI-driven anomaly detection (later phases)
