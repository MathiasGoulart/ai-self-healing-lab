# Recovery Criteria

**Document type:** Experimental protocol (frozen for E001+)  
**Status:** **Frozen** — see also [`protocol-freeze.md`](protocol-freeze.md)

---

## Primary SLI

Authoritative degradation / recovery signal:

```text
order-service order-processing latency p95
```

Prometheus metric: `order_processing_duration_seconds`  
Client-side k6 metrics are **not** the authoritative health state.

---

## State machine

```text
HEALTHY
   |
   | 2 of 3 × 30s windows with p95 > 500 ms
   v
DEGRADED
   |
   | 2 of 3 × 30s windows with p95 < 500 ms
   v
HEALTHY
```

### Meaning of “2 of 3”

Evaluation is performed every 30 seconds using a rolling set of the three most recent 30-second windows.

So `{W1, W2, W3}` is one evaluation; `{W2, W3, W4}` is the next. See [`protocol-freeze.md`](protocol-freeze.md).

---

## Degradation rule

| Parameter | Value |
|-----------|-------|
| Sampling window | 30 seconds |
| Condition | order-processing p95 **>** 500 ms |
| Evaluation | **2 of 3** consecutive windows |
| Effect | HEALTHY → DEGRADED |

---

## Recovery rule

| Parameter | Value |
|-----------|-------|
| Sampling window | 30 seconds |
| Condition | order-processing p95 **<** 500 ms |
| Evaluation | **2 of 3** consecutive windows |
| Effect | DEGRADED → HEALTHY |

A single datapoint or single window below 500 ms does **not** establish recovery.

---

## Threshold wording

> 500 ms is an experimental operational threshold selected for this study based on the observed E000 baseline and the need to distinguish normal latency variation from the F01-induced degradation.

Not a universal backend latency standard.

---

## Why p95 + M-of-N

E000 observed naturally occurring tail-latency spikes (occasional multi-second maxima). The protocol therefore uses **p95** with **2-of-3** windows rather than reacting to isolated spikes.

---

## Invalid criteria

- “The graph looks normal”
- “The agent said it recovered”
- “We executed a remediation action” (action ≠ recovery)
- Using k6-only latency as authoritative operational health

---

## Controlled baseline reference

Primary controlled baseline dataset: **E000-R6 / R7 / R8**  
(R3–R5 potentially confounded by load-generator power-saving; preserved but not primary.)

Details: [`../load-testing/experiments/E000-REPEATS.md`](../load-testing/experiments/E000-REPEATS.md)
