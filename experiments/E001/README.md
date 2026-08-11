# Experiment E001 — Payment Latency (Medium)

| Field | Value |
|-------|-------|
| **Experiment ID** | `E001` |
| **Name** | Payment Latency — Medium |
| **Fault** | F01 (`payment_latency`) |
| **Target** | payment-service |
| **Severity** | medium |
| **Injected latency** | 2000ms |
| **Workload** | create → process (`load-testing/scenarios/baseline.js`) |
| **Rate** | 10 iterations/second |
| **Duration** | 10 minutes |
| **AI / self-healing** | None |

> **Status: DEFINED ONLY — Formal E001 experiment NOT EXECUTED in Phase 2A.**

---

## Planned timeline

```text
0–3 min    NORMAL
3–6 min    F01 ACTIVE (+2000ms)
6–10 min   NORMAL / RECOVERY OBSERVATION
```

## Configuration

See [`configuration.json`](configuration.json).

## Preconditions (before formal run)

1. Payment Service image with F01 control API deployed (immutable `sha-*` tag).
2. Manual F01 smoke test passed (instrument validation).
3. Order Service + Postgres healthy; Prometheus scraping both services.
4. k6 reachable via port-forward (or equivalent).
5. Record Order Service and Payment Service image digests/tags in the run artifact.

## Control commands (during formal run)

```bash
# t≈3m — activate
curl -X POST http://127.0.0.1:3001/faults \
  -H 'Content-Type: application/json' \
  -d '{"fault":"payment_latency","severity":"medium"}'

# t≈6m — deactivate
curl -X DELETE http://127.0.0.1:3001/faults/payment_latency
```

Record activate/deactivate UTC timestamps from the JSON response / structured logs for TTD/TTR (future phases).

## Grafana annotations (manual)

```text
E001 START
FAULT: payment_latency
PARAMETER: 2s
E001 END
```

## Results

_Formal run not executed. Do not treat Phase 2A smoke test as E001 results._
