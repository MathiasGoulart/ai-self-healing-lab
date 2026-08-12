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

> **Status: EXECUTED** (fault characterization, no self-healing).  
> Run artifacts: [`../../load-testing/experiments/E001/`](../../load-testing/experiments/E001/)  
> Results summary: [`../../load-testing/experiments/E001/RESULTS.md`](../../load-testing/experiments/E001/RESULTS.md)

Canonical freeze: [`../../research/protocol-freeze.md`](../../research/protocol-freeze.md)

---

## Purpose

Initial E001 is a **fault-characterization** experiment (no AI):

```text
fault → observable degradation → fault removal → recovery
```

---

## Frozen evaluation rules

| Item | Value |
|------|-------|
| Primary SLI | Prometheus `order_processing_duration_seconds` **p95** (order-service) |
| Sampling window | 30 seconds |
| Degradation | **2 of 3** rolling 30s windows with p95 **>** 500 ms → DEGRADED |
| Recovery | **2 of 3** rolling 30s windows with p95 **<** 500 ms → HEALTHY |

Evaluation is performed every 30 seconds using a rolling set of the three most recent 30-second windows (e.g. `{W1,W2,W3}`, then `{W2,W3,W4}`).

k6 metrics remain client-facing measurements; they are **not** the authoritative degradation state.

> 500 ms is an experimental operational threshold selected for this study based on the observed E000 baseline and the need to distinguish normal latency variation from the F01-induced degradation.

---

## Planned timeline

```text
0–3 min    NORMAL / baseline phase
3–6 min    F01 ACTIVE (+2000ms) / fault phase
6–10 min   NORMAL / recovery observation phase
```

## Configuration

See [`configuration.json`](configuration.json).

## Fault ground truth

FaultController is the source of truth for fault occurrence:

- activation / deactivation timestamps  
- `GET /faults`  
- `fault_injection_active`  
- structured `fault_injection` logs  

## Timestamps (this run)

| Symbol | UTC | Notes |
|--------|-----|-------|
| T0 | 2026-08-11T22:14:47Z | Fault activated |
| T1 | 2026-08-11T22:15:47Z | Degradation detected (2-of-3) |
| T2 | N/A | No self-healing action |
| T3 | 2026-08-11T22:18:47Z | Recovery confirmed after manual deactivation |

```text
TTD = T1 − T0 = 60 s
TTR = T3 − T0 = 240 s   (observed recovery after manual deactivation; not self-healing)
```

## How to re-run

```bash
# Port-forwards: order :13000, payment :13001, prometheus :19090
bash load-testing/run-e001.sh
```

## Control commands (during formal run)

```bash
# t≈3m — activate (T0)
curl -X POST http://127.0.0.1:13001/faults \
  -H 'Content-Type: application/json' \
  -d '{"fault":"payment_latency","severity":"medium"}'

# t≈6m — deactivate
curl -X DELETE http://127.0.0.1:13001/faults/payment_latency
```

## Grafana annotations (convention)

```text
E001_START
F01_ACTIVATED
F01_DEACTIVATED
E001_END
```

Timestamps for this run are recorded in `load-testing/experiments/E001/timeline.json` (not auto-posted to Grafana).

## Results

See [`../../load-testing/experiments/E001/RESULTS.md`](../../load-testing/experiments/E001/RESULTS.md).
