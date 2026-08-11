# Experiment E000 — Baseline

| Field | Value |
|-------|-------|
| **Experiment ID** | `E000` |
| **Name** | Baseline |
| **Faults** | None |
| **Duration** | 10 minutes |
| **Target** | Order Service |
| **Workload** | create → process |
| **Arrival rate** | 10 iterations/second |

## Purpose

Establish **normal behavior** under a controlled, non-stressful workload.

This is **not** a stress test. The goal is an empirical baseline for later fault-injection experiments (E001+).

## Workload definition

One k6 **iteration** = one business flow:

```text
POST /orders
POST /orders/:id/process
```

With `RATE=10`:

| Quantity | Approximate value |
|----------|-------------------|
| Business flows / s | 10 |
| HTTP requests / s (healthy) | ~20 |

Arrival rate is controlled with `constant-arrival-rate` and does **not** depend on request latency.

## Configuration

```bash
EXPERIMENT_ID=E000
SCENARIO=baseline
RATE=10
DURATION=10m
PRE_ALLOCATED_VUS=20
MAX_VUS=100
REQUEST_TIMEOUT=10s
```

Capture immutable image tags from the cluster **before** the run (do not use `latest`):

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing get deploy order-service payment-service \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'
```

## How to run

See [`../../README.md`](../../README.md).

Shortcut (port-forward + metadata):

```bash
# From repository root — if local compose already uses :3000, forward to another port:
kubectl --context rooteny-kubernetes -n ai-self-healing port-forward svc/order-service 13000:3000

BASE_URL=http://127.0.0.1:13000 ./load-testing/run-e000.sh
```

Or manually:

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing port-forward svc/order-service 3000:3000

K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_OPEN=false \
K6_WEB_DASHBOARD_EXPORT=load-testing/experiments/E000/report.html \
k6 run \
  -e BASE_URL=http://127.0.0.1:3000 \
  -e EXPERIMENT_ID=E000 \
  -e RATE=10 \
  -e DURATION=10m \
  -e ORDER_SERVICE_IMAGE='ghcr.io/mathiasgoulart/ai-self-healing-lab/order-service:sha-…' \
  -e PAYMENT_SERVICE_IMAGE='ghcr.io/mathiasgoulart/ai-self-healing-lab/payment-service:sha-…' \
  load-testing/scenarios/baseline.js
```

## Grafana annotations (manual)

Mark the experiment window in Grafana:

```text
E000 START
E000 END
```

Correlate with application metrics during the same window.

## Expected outputs

| File | Description |
|------|-------------|
| `summary.json` | Machine-readable k6 summary + experiment config |
| `report.html` | k6 Web Dashboard HTML export (if supported; short runs may skip) |
| Console | Human-readable k6 text summary |

## Results (completed)

| Field | Value |
|-------|-------|
| Date/time (UTC) | **2026-08-10T11:20:38Z → 11:30:38Z** (~10m) |
| Order Service image | `ghcr.io/mathiasgoulart/ai-self-healing-lab/order-service:sha-fd43433` |
| Payment Service image | `ghcr.io/mathiasgoulart/ai-self-healing-lab/payment-service:sha-fd43433` |
| k6 version | `v1.7.1` |
| RATE / DURATION | `10` / `10m` |
| BASE_URL | `http://127.0.0.1:13000` (kubectl port-forward to k3s `svc/order-service`) |
| Fault configuration | None |
| Prometheus | `observability/kps-prometheus` |
| Grafana | `observability/kube-prometheus-grafana` (manual annotation: `E000 START` / `E000 END`) |
| Result location | `load-testing/experiments/E000/` (`summary.json`, `report.html`) |
| Achieved iteration rate | **10.000191 /s** (6001 iterations) |
| Achieved HTTP RPS | **20.000381 /s** (12002 requests) |
| Checks | **100%** (24004 pass / 0 fail) |
| HTTP failures | **0%** |
| Client flow duration (k6) | avg **111 ms**, p95 **323 ms**, max **2.73 s** |
| Notes | No retries; constant-arrival-rate held ~10 iters/s without uncontrolled bursts. Prometheus counters rose during the window (`orders_created_total`, `orders_processing_total`, `payment_requests_total`, `http_requests_total` on both services; duration histograms observed). |

### Prometheus spot-check (after run)

| Metric | Observed |
|--------|----------|
| `orders_created_total` | 6453 (includes prior smoke + E000) |
| `orders_processing_total{result="success"}` | 6453 |
| `payment_requests_total` (order + payment jobs) | populated / matching |
| `http_requests_total` (order-service) | 12906 |
| `http_request_duration_seconds_*` / `order_processing_duration_seconds_*` / `payment_request_duration_seconds_*` | histogram buckets present |
| `database_pool_*`, `process_resident_memory_bytes`, `nodejs_eventloop_delay_seconds` | present |

## Prometheus metrics to verify during E000

**Order Service:** `http_requests_total`, `http_request_duration_seconds`, `orders_created_total`, `orders_processing_total`, `order_processing_duration_seconds`, `payment_requests_total`, `payment_request_duration_seconds`, `database_pool_*`, `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_eventloop_delay_seconds`

**Payment Service:** `http_requests_total`, `http_request_duration_seconds`, `payment_requests_total`, runtime metrics

k6 reports **client experience**; Grafana reports **system behavior**.
