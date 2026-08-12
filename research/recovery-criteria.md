# Recovery Criteria

**Document type:** Experimental protocol  
**Status:** **Frozen** — E001 latency-only (executed); E002+ dual-outcome model (2026-08-12)  
**Canonical detail:** [`protocol-freeze.md`](protocol-freeze.md)

---

## Primary SLI (latency)

Authoritative degradation signal:

```text
order-service order-processing latency p95
```

Prometheus metric: `order_processing_duration_seconds`  
Client-side k6 metrics are **not** the authoritative health state.

PromQL (30s):

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(order_processing_duration_seconds_bucket{job="order-service"}[30s])
  )
)
```

---

## Availability guardrail (E002+)

Authoritative success-rate signal for self-healing outcome classification:

```promql
sum(rate(orders_processing_total{job="order-service",result="success"}[30s]))
/
sum(rate(orders_processing_total{job="order-service"}[30s]))
```

Use `job="order-service"` (E001 / Grafana convention). Do not rely on app label `service` alone (`exported_service` after scrape).

**Threshold X (`X_success`):** **99%** (frozen; E000-R6/R7/R8 observed healthy success = 100%; see [`r01-parameter-characterization.md`](r01-parameter-characterization.md)).

---

## Degradation rule (all experiments)

| Parameter | Value |
|-----------|-------|
| Sampling window | 30 seconds |
| Condition | order-processing p95 **>** 500 ms |
| Evaluation | **2 of 3** consecutive windows (rolling) |
| Effect | HEALTHY → DEGRADED |

---

## Recovery — E001 (executed, latency only)

| Parameter | Value |
|-----------|-------|
| Condition | order-processing p95 **<** 500 ms |
| Evaluation | **2 of 3** |
| Effect | DEGRADED → HEALTHY |

Used only for fault characterization after **manual** fault deactivation. Not sufficient for AI self-healing attribution.

---

## Recovery — E002+ (latency ∧ availability)

Both conditions must hold in the **same** 30 s window; then apply 2-of-3 to those conjunctive windows:

```text
recovery_window_i =
    (p95_i < 500 ms)
    AND
    (success_rate_i >= 99%)

SUCCESSFUL RECOVERY =
    count(recovery_window_i == true) >= 2
    over the latest 3 windows
```

| Class | Per-window predicate (≥ 2 of latest 3) | Timestamp |
|-------|----------------------------------------|-----------|
| **SUCCESSFUL RECOVERY** | `p95 < 500` **∧** `success ≥ 99%` | **T3** |
| **PERFORMANCE CONTAINMENT** | `p95 < 500` **∧** `success < 99%` | **T3c** |
| **NOT RECOVERED** | `p95 ≥ 500` **∧** `success ≥ 99%` | — |
| **DEGRADED** | `p95 ≥ 500` **∧** `success < 99%` | — |

Do **not** AND two independent 2-of-3 evaluations (latency M-of-N separately from success M-of-N).

Action initiation = **T2**. Fault must remain active (`fault_injection_active = 1`). FaultController must **not** be used as remediation.

R01 (runtime dependency timeout, `timeout_ms = 300`) under F01 is **expected** to land in **PERFORMANCE CONTAINMENT**. Falling success rate is an intended cost of fail-fast containment, not a bug. See [`remediation-r01.md`](remediation-r01.md).

---

## Threshold wording

> 500 ms is an experimental operational threshold selected for this study based on the observed E000 baseline and the need to distinguish normal latency variation from the F01-induced degradation.

Not a universal backend latency standard.

> 99% success (`X_success`) is the frozen experimental availability floor, derived from a controlled baseline with observed 100% process success (E000-R6/R7/R8).

---

## Why p95 + M-of-N + availability

E000 observed naturally occurring tail-latency spikes. The protocol therefore uses **p95** with **2-of-3** windows rather than reacting to isolated spikes.

E002+ adds the success-rate guardrail so an AI cannot “recover” latency solely by rejecting requests.

---

## Invalid criteria

- “The graph looks normal”
- “The agent said it recovered”
- “We executed a remediation action” (action ≠ recovery / containment)
- Using k6-only latency as authoritative operational health
- Latency-only recovery for self-healing runs (E002+)
- Recovery after FaultController deactivation attributed as AI self-healing

---

## Controlled baseline reference

Primary controlled baseline dataset: **E000-R6 / R7 / R8**  
(R3–R5 potentially confounded by load-generator power-saving; preserved but not primary.)

Details: [`../load-testing/experiments/E000-REPEATS.md`](../load-testing/experiments/E000-REPEATS.md)
