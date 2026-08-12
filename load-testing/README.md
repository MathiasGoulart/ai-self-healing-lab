# Load testing (k6)

Grafana **k6** is the official workload-generation and load-testing tool for this research lab.

Do **not** use a custom Node.js traffic generator.

## Layout

```text
load-testing/
├── scenarios/
│   └── baseline.js          # create → process business flow
├── experiments/
│   ├── E000/ … E000-R8/     # baseline experiment artifacts
│   └── E001/                # F01 characterization run artifacts
├── reports/                 # optional shared report drop zone
├── run-e000.sh              # helper: capture image tags + run E000
├── run-e000-repeats.sh      # E000 repetition helper
├── run-e001.sh              # formal E001 (F01 activate/deactivate timeline)
└── README.md
```

## Separation of concerns

| Tool | Measures |
|------|----------|
| **k6** | What the **external client** experienced (latency, errors, iteration rate, flow duration) |
| **Prometheus** | What happened **inside** the system (app throughput, pools, CPU, event-loop, …) |
| **Grafana** | Correlation / visualization of system metrics during the experiment window |

Do not push experiment IDs into application Prometheus metric labels.

## Business flow

Each k6 **iteration**:

1. `POST /orders` → expect `201` + UUID `id`
2. `POST /orders/:id/process` → expect `200` + `status: "PAID"`

No retries. Creation failure ends the iteration; processing failure is recorded and the iteration ends.

### Arrival rate vs HTTP RPS

`constant-arrival-rate` controls **iterations/second** (complete flows), not raw HTTP RPS.

Example: `RATE=10` ⇒ ~10 flows/s ⇒ ~**20 HTTP requests/s** when the system is healthy.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `BASE_URL` | `http://127.0.0.1:3000` | Order Service base URL |
| `EXPERIMENT_ID` | `E000` | Experiment id (k6 tags + output path) |
| `SCENARIO` | `baseline` | Scenario name tag |
| `RATE` | `10` | Target iterations per second |
| `DURATION` | `10m` | Scenario duration |
| `PRE_ALLOCATED_VUS` | `20` | Pre-allocated VUs |
| `MAX_VUS` | `100` | Max VUs for arrival-rate executor |
| `REQUEST_TIMEOUT` | `10s` | Per-request HTTP timeout |
| `OUT_DIR` | `load-testing/experiments/<id>` | Where `summary.json` is written |
| `ORDER_SERVICE_IMAGE` | `unknown` | Immutable image tag/digest under test |
| `PAYMENT_SERVICE_IMAGE` | `unknown` | Immutable image tag/digest under test |
| `PRODUCT_ID` | `product-123` | Create-order payload |

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally (`k6 version`)
- Reachable Order Service (`docker compose` or k3s via port-forward / in-cluster Job later)

## Run against local Docker Compose

```bash
cd application/order-service && docker compose up -d
cd ../..

k6 run \
  -e BASE_URL=http://127.0.0.1:3000 \
  -e EXPERIMENT_ID=E000 \
  -e RATE=10 \
  -e DURATION=1m \
  load-testing/scenarios/baseline.js
```

## Run against k3s

k6 stays **outside** the application Deployment (no permanent k6 Deployment).

### Option A — from the developer machine (port-forward)

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing port-forward svc/order-service 3000:3000
```

In another terminal:

```bash
./load-testing/run-e000.sh
# or see experiments/E000/README.md for the full k6 command
```

### Option B — ephemeral in-cluster Job (optional later)

Not required for Phase 1.6. A future `Job` can run the same script against `http://order-service:3000`.

## Capture application versions (required)

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing get deploy order-service payment-service \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'
```

Pass those exact tags into `ORDER_SERVICE_IMAGE` / `PAYMENT_SERVICE_IMAGE`. Never record only `latest`.

## HTML report

With k6 ≥ 0.49 (this lab uses k6 v1.x), Web Dashboard HTML export:

```bash
K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_OPEN=false \
K6_WEB_DASHBOARD_EXPORT=load-testing/experiments/E000/report.html \
k6 run ... load-testing/scenarios/baseline.js
```

`handleSummary` always writes `summary.json` under `OUT_DIR`.

Very short runs may log `report generation was skipped (not enough data)` — use at least ~1 minute for a reliable HTML export.

## Grafana annotations (manual for now)

```text
E000 START
E000 END
```

Future faults:

```text
E001 START
FAULT: payment_latency
PARAMETER: 2s
E001 END
```

## Experiments

| ID | Name | Faults | Docs |
|----|------|--------|------|
| E000 | Baseline | None | [`experiments/E000/README.md`](experiments/E000/README.md) |

## Custom k6 metrics

| Metric | Type | Meaning |
|--------|------|---------|
| `order_creation_success` / `_failure` | Counter | Create-order outcome |
| `order_processing_success` / `_failure` | Counter | Process-order outcome |
| `order_flow_duration` | Trend | End-to-end create+process duration (client) |

Built-in k6 HTTP metrics cover per-request latency/errors.

Trend summaries include **p50 (med), p90, p95, p99, max** via `summaryTrendStats`.  
**Do not** use k6 p99 (or k6 p95) as the authoritative degradation threshold — that remains Prometheus order-processing p95 ([`../research/protocol-freeze.md`](../research/protocol-freeze.md)).

## Out of scope

Custom traffic generators, AI, fault injection, Grafana automation, performance pass/fail thresholds for E000.
