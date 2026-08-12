# Observability model (research telemetry)

Phase 1.5 establishes the **metrics baseline** for later comparative experiments.

## Surfaces

| Signal | How |
|--------|-----|
| Metrics | `GET /metrics` on **order-service** and **payment-service** |
| Logs | Structured JSON on stdout (`requestId`, event names, optional `traceId`/`spanId`) |
| Traces | OpenTelemetry from order-service (OTLP if configured; otherwise console exporter) |

## Design rules

1. Low-cardinality labels only (`method`, `route`, `status_code`, `result`, plus default `service`; fault-injection metrics may use `fault` / `severity` / `action`). Never `order_id`, `request_id`, `run_id`, `experiment_id`, raw URLs, or timestamps as Prometheus labels.
2. Histograms expose buckets; **Prometheus** computes p50/p95/p99 via `histogram_quantile`. Applications never emit percentile gauges.
3. Kubernetes probe traffic (`/health/live`, `/health/ready`, and payment `/health*`) and control surfaces (`/remediation*`, payment `/faults*`) are **excluded** from HTTP workload metrics.
4. Application `/metrics` = app + process/runtime metrics. Container/node metrics come from the cluster later — not from the app.
5. Experiment identity belongs in Grafana annotations, structured logs, and experiment artifacts — not high-cardinality metric labels.
6. Remediation and fault control APIs are **ClusterIP / port-forward only** — never publish them via Ingress.

## Primary SLI vs client measurements

| Role | Source |
|------|--------|
| **Authoritative operational SLI** | Prometheus `order_processing_duration_seconds` **p95** (order-service) |
| **Client-facing experiment measurements** | k6 HTTP / order-flow latency, checks, throughput |

Degradation / recovery ground truth uses the Prometheus primary SLI with a frozen 2-of-3 × 30s rule at 500 ms ([`../research/protocol-freeze.md`](../research/protocol-freeze.md)).

### Primary SLI PromQL (30s window)

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(order_processing_duration_seconds_bucket{job="order-service"}[30s])
  )
)
```

Prefer `job="order-service"` on this cluster (the app `service` label may appear as `exported_service` after scrape).

## Health vs workload

```text
Kubernetes probes → /health/live | /health/ready   (operational; not in http_* workload series)
Load generator   → POST /orders, POST /orders/:id/process, POST /payments
```

## Order Service — primary metrics

```text
HTTP
├── http_requests_total
├── http_request_duration_seconds
├── http_errors_total
└── http_active_requests

Orders
├── orders_created_total
├── orders_processing_total          {result=success|failure}
└── order_processing_duration_seconds

Payment dependency (client-side)
├── payment_requests_total           {result=success|failure}
├── payment_request_duration_seconds
└── payment_timeouts_total           (R01 AbortSignal aborts)

Remediation (R01 — ClusterIP /remediation* only; no Ingress)
├── remediation_active               {action=payment_timeout}
└── remediation_payment_timeout_ms   (0 when inactive)

Database
├── database_pool_active_connections
├── database_pool_idle_connections
└── database_pool_waiting_requests

Runtime
├── process_cpu_seconds_total
├── process_resident_memory_bytes
└── nodejs_eventloop_delay_seconds   (Histogram — canonical event-loop metric)
```

Secondary Node.js metrics (heap, GC, handles, …) remain available for future analysis.

## Payment Service — primary metrics

```text
HTTP (server-side)
├── http_requests_total
├── http_request_duration_seconds
├── http_errors_total
└── http_active_requests

Payments (server-side)
└── payment_requests_total           {result=success|failure}

Runtime
├── process_cpu_seconds_total
├── process_resident_memory_bytes
└── nodejs_eventloop_delay_seconds
```

Client vs server payment latency:

```text
Order Service  payment_request_duration_seconds  (client observe)
Payment Service http_request_duration_seconds    (server observe on POST /payments)
```

## PromQL examples

**Throughput (order-service workload only)**

```promql
sum(rate(http_requests_total{service="order-service"}[1m]))
```

**Error rate (5xx)**

```promql
sum(rate(http_requests_total{service="order-service",status_code=~"5.."}[5m]))
/
sum(rate(http_requests_total{service="order-service"}[5m]))
```

**HTTP latency p50 / p95 / p99**

```promql
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m])))
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m])))
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{service="order-service"}[5m])))
```

**Event-loop p99 (from Histogram, not app gauges)**

```promql
histogram_quantile(0.99, sum by (le) (rate(nodejs_eventloop_delay_seconds_bucket{service="order-service"}[5m])))
```

**CPU utilization**

```promql
rate(process_cpu_seconds_total{service="order-service"}[1m])
```

HTTP latency buckets (seconds): `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`.

## Grafana research dashboard

Provisioned ConfigMap: [`../infrastructure/k3s/grafana/dashboard-ai-self-healing-lab.yaml`](../infrastructure/k3s/grafana/dashboard-ai-self-healing-lab.yaml)

Includes **Primary SLI — Order Processing p95** with a **500 ms** threshold line, plus annotation documentation for E001 markers.

### Experiment annotations (convention)

```text
E001_START
F01_ACTIVATED
F01_DEACTIVATED
E001_END
```

Optional tags: `experiment_id=E001`, `fault=F01`, `severity=medium`, `phase=baseline|fault|recovery`.

## Intentionally removed

- `nodejs_eventloop_lag_*` (including in-process p50/p90/p99 gauges) — redundant with `nodejs_eventloop_delay_seconds`
- Health/probe paths from `http_requests_total` / duration / errors
