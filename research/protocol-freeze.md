# Experimental Protocol Freeze (Phase 2B)

**Document type:** Frozen experimental protocol  
**Status:** Frozen — **E001 EXECUTED** (fault characterization, 2026-08-11)  
**Date:** 2026-08-11

This document freezes the measurement and health-evaluation model used for E001 characterization and later Embedded AI vs External Agent comparisons.

---

## 1. Primary SLI

**Authoritative operational SLI (server-side / Prometheus):**

```text
Order Service — order processing latency p95
```

**Metric:**

```text
order_processing_duration_seconds
```

**Reference PromQL (30s sampling window):**

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(order_processing_duration_seconds_bucket{job="order-service"}[30s])
  )
)
```

### Perspective separation

| Perspective | Tool | Role |
|-------------|------|------|
| **Authoritative operational SLI** | Prometheus (`order_processing_duration_seconds` p95) | Degradation / recovery ground truth for the application |
| **Client-facing experiment measurements** | k6 (`http_req_duration`, `order_flow_duration`, checks, throughput) | What the external client experienced under the controlled workload |

**Do not** use k6 client-side metrics as the authoritative degradation state.

Reason: future External Agent experiments must observe the primary SLI through application observability infrastructure (Prometheus), while Embedded AI may also use local signals. Both architectures are evaluated against the **same** server-side SLI definition.

---

## 2. Health state machine

```text
HEALTHY
   |
   | 2 of 3 windows with order-processing p95 > 500 ms
   v
DEGRADED
   |
   | 2 of 3 windows with order-processing p95 < 500 ms
   v
HEALTHY
```

This state machine is the **experimental ground truth** for application health.

### Meaning of “2 of 3”

Evaluation is performed every 30 seconds using a **rolling** set of the three most recent 30-second windows.

Example:

```text
At t = end of W3:  evaluate {W1, W2, W3}
At t = end of W4:  evaluate {W2, W3, W4}
At t = end of W5:  evaluate {W3, W4, W5}
```

So `{W1, W2, W3}` and `{W2, W3, W4}` are **separate** successive evaluations — not a single non-overlapping block of three windows.

A transition occurs at the first evaluation time when at least **2 of those 3** most recent windows satisfy the threshold condition.

No automatic self-healing is implemented as part of this freeze.

---

## 3. Degradation rule (frozen)

| Parameter | Value |
|-----------|-------|
| Sampling window | **30 seconds** |
| Threshold | order-processing **p95 > 500 ms** |
| Evaluation | **2 out of 3** consecutive sampling windows (rolling; see above) |
| Transition | HEALTHY → DEGRADED |

A single window above 500 ms does **not** establish degradation.

### Threshold justification

> 500 ms is an experimental operational threshold selected for this study based on the observed E000 baseline and the need to distinguish normal latency variation from the F01-induced degradation.

This is **not** a universal latency limit and is **not** claimed as an industry standard backend budget.

---

## 4. Recovery rule (frozen)

| Parameter | Value |
|-----------|-------|
| Sampling window | **30 seconds** |
| Threshold | order-processing **p95 < 500 ms** |
| Evaluation | **2 out of 3** consecutive sampling windows (rolling; see above) |
| Transition | DEGRADED → HEALTHY |

A single datapoint (or single window) below 500 ms does **not** establish recovery.

Same M-of-N model as degradation (2-of-3 rolling windows).

---

## 5. Experimental timestamps

| Symbol | Meaning |
|--------|---------|
| **T0** | Fault activation |
| **T1** | Degradation detected (2-of-3 rule first satisfied) |
| **T2** | Recovery action initiated |
| **T3** | Recovery confirmed (2-of-3 recovery rule first satisfied) |

```text
TTD = T1 − T0
TTR = T3 − T0
```

### E001 characterization run (no AI)

E001 characterizes system response to an injected fault **without** self-healing. Record:

| Timestamp | Meaning for E001 |
|-----------|------------------|
| **T0** | Fault activated (FaultController) |
| **T1** | Degradation detected (2-of-3 primary SLI rule) |
| **T2** | **N/A** — no self-healing action |
| **T3** | Recovery confirmed after **manual** fault deactivation (2-of-3 recovery rule first satisfied) |

```text
T0 = fault activated
T1 = degradation detected
T2 = N/A — no self-healing action
T3 = recovery confirmed after fault deactivation
```

**T3 is recorded** as *observed recovery after manual fault deactivation* — not as self-healing recovery. That distinction matters: E001 establishes

```text
fault → observable degradation → fault removal → recovery
```

before later experiments attribute recovery to an AI/agent action (where T2 becomes meaningful).

Do **not** invent a T2 for E001. Do **record** T3 when the frozen recovery rule is first satisfied after deactivation.

---

## 6. Fault ground truth

The **FaultController** (Payment Service control API) is the source of truth for fault state.

For F01 (E001):

| Field | Value |
|-------|-------|
| fault | `payment_latency` |
| severity | `medium` |
| parameter | `2000` ms |

Record:

- fault activation timestamp  
- fault deactivation timestamp  
- fault state (`GET /faults`, Prometheus `fault_injection_active`, structured logs)

The AI/agent is **not** the source of truth for whether a fault occurred. This separates:

```text
fault occurrence  ≠  anomaly detection  ≠  diagnosis  ≠  recovery
```

---

## 7. Prometheus cardinality

**Do not** add high-cardinality labels such as:

```text
run_id
experiment_id
timestamp
request_id
order_id
trace_id
```

to high-frequency application metrics.

Experiment identity belongs in:

- Grafana annotations  
- structured logs  
- experiment metadata / artifacts  
- k6 `summary.json`

Stable Prometheus label dimensions remain appropriate (e.g. `service`, `route`, `method`, `status_code`, `result`, `fault`, `severity`).

---

## 8. E000 baseline classification (frozen interpretation)

| Runs | Role |
|------|------|
| **R1 / R2** | Original-condition observations |
| **R3 / R4 / R5** | Potentially confounded by load-generator power-saving |
| **R6 / R7 / R8** | **Primary controlled baseline dataset** |

> The R3–R5 repetitions were potentially confounded by load-generator power-saving. Controlled repetitions R6–R8 were subsequently executed under AC power with Low Power Mode disabled and sleep prevention enabled.

Do **not** claim that power-saving definitively caused the R3–R5 difference. Original artifacts remain preserved.

### Controlled baseline sample (k6 client flow p95 — descriptive only)

Primary controlled baseline dataset: **E000-R6 / R7 / R8**.

The baseline dataset is descriptive and is not used to establish a statistically validated population distribution.

| Run | Flow p95 (approx.) |
|-----|-------------------:|
| R6 | ≈ 300.3 ms |
| R7 | ≈ 288.5 ms |
| R8 | ≈ 306.5 ms |

E000 also observed naturally occurring tail-latency events, including occasional multi-second **maximum** latencies. This motivates using **p95 + M-of-N**, rather than reacting to isolated spikes.

Authoritative degradation for experiments remains **server-side order-processing p95**, not k6 flow p95.

---

## 9. E001 protocol (frozen definition — EXECUTED)

| Field | Value |
|-------|-------|
| Experiment | E001 — fault characterization |
| Fault | F01 — payment latency |
| Severity | medium |
| Injected latency | +2000 ms |
| Workload | baseline create→process, **10 iterations/s** |
| Sampling | 30-second windows |
| Degradation | 2 of 3 windows with order-processing p95 **>** 500 ms |
| Recovery | 2 of 3 windows with order-processing p95 **<** 500 ms |
| AI / self-healing | **None** |

Purpose of initial E001:

```text
fault → observable degradation → fault removal → recovery
```

before comparing self-healing strategies.

```text
E001 formal experiment: EXECUTED (2026-08-11)
TTD = 60 s
TTR = 240 s   (observed recovery after manual deactivation; not self-healing)
```

Results: [`../load-testing/experiments/E001/RESULTS.md`](../load-testing/experiments/E001/RESULTS.md)

---

## 10. Future AI comparison metrics (measurement model only)

See [`ai-comparison-metrics.md`](ai-comparison-metrics.md).

---

## Related documents

- [`recovery-criteria.md`](recovery-criteria.md)  
- [`metrics.md`](metrics.md)  
- [`experimental-protocol.md`](experimental-protocol.md)  
- [`../experiments/E001/README.md`](../experiments/E001/README.md)  
- [`../load-testing/experiments/E000-REPEATS.md`](../load-testing/experiments/E000-REPEATS.md)  
- [`../docs/observability.md`](../docs/observability.md)  
- Grafana: [`../infrastructure/k3s/grafana/`](../infrastructure/k3s/grafana/)
