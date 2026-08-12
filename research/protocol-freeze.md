# Experimental Protocol Freeze (Phase 2B)

**Document type:** Frozen experimental protocol  
**Status:** Frozen — E001 executed (2026-08-11); E002+ dual-outcome recovery and R01 parameters frozen (2026-08-12)  
**Date:** 2026-08-11; amended 2026-08-12

This document freezes the measurement and health-evaluation model used for E001 characterization and later Embedded AI vs External Agent comparisons.

### R01 freeze summary (E002 / E003)

| Item | Frozen value |
|------|--------------|
| Remediation | **R01 — Runtime Dependency Timeout** ([`remediation-r01.md`](remediation-r01.md)) |
| E002 / E003 `timeout_ms` | **300 ms** (fixed; AI must **not** choose) |
| Actuator bounds | **250 ms ≤ timeout_ms ≤ 450 ms** |
| Availability guardrail `X_success` | **success ≥ 99%** |
| E004 | AI may choose `timeout_ms` within **[250, 450] ms** (separate experiment) |

Characterization evidence: [`r01-parameter-characterization.md`](r01-parameter-characterization.md). Actuator **not implemented**; E002/E003 **not executed**.

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

### 2.1 E001 (fault characterization — latency only)

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

E001 used **latency alone**. That remains valid for the executed characterization run. It is **insufficient** for AI self-healing attribution (latency-only escape hatch).

### 2.2 E002+ (self-healing runs — latency + availability)

```text
HEALTHY
   |
   | 2 of 3 windows with order-processing p95 > 500 ms
   v
DEGRADED
   |
   | evaluate latency AND success-rate guardrail (2 of 3)
   v
outcome class (see §4.1)
```

Degradation detection remains latency-based (unchanged).  
**Recovery / outcome classification** for self-healing runs uses per-window conjunction then 2-of-3 (§4.1) — not independent M-of-N on each metric.

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

No automatic self-healing is implemented as part of the E001 freeze. E002+ remediation design: [`remediation-r01.md`](remediation-r01.md).

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

## 4. Recovery rule

### 4.0 E001 (executed — latency only)

| Parameter | Value |
|-----------|-------|
| Sampling window | **30 seconds** |
| Threshold | order-processing **p95 < 500 ms** |
| Evaluation | **2 out of 3** consecutive sampling windows (rolling; see above) |
| Transition | DEGRADED → HEALTHY |

A single datapoint (or single window) below 500 ms does **not** establish recovery.

### 4.1 E002+ outcome taxonomy (latency ∧ availability)

Latency-only “recovery” is an **escape hatch**: an AI could drive p95 down by rejecting all requests (e.g. `timeout_ms = 1`). Self-healing runs therefore require **both** latency and availability in the **same** sampling window before counting that window toward 2-of-3.

**Per-window predicates** (each 30 s window `i`):

```text
recovery_window_i =
    (p95_i < 500 ms)
    AND
    (success_rate_i >= 99%)

containment_window_i =
    (p95_i < 500 ms)
    AND
    (success_rate_i < 99%)

not_recovered_window_i =
    (p95_i >= 500 ms)
    AND
    (success_rate_i >= 99%)

degraded_window_i =
    (p95_i >= 500 ms)
    AND
    (success_rate_i < 99%)
```

**2-of-3 rule (rolling):** at each evaluation, consider the three most recent windows. An outcome class is declared when at least **2 of those 3** windows satisfy that class’s per-window predicate.

```text
SUCCESSFUL RECOVERY =
    count(recovery_window_i == true) >= 2
    over the latest 3 windows

PERFORMANCE CONTAINMENT =
    count(containment_window_i == true) >= 2
    over the latest 3 windows
```

`p95_i` is order-processing p95 for window `i`.  
`success_rate_i` is:

```promql
sum(rate(orders_processing_total{job="order-service",result="success"}[30s]))
/
sum(rate(orders_processing_total{job="order-service"}[30s]))
```

Use `job="order-service"` (same scrape convention as the primary latency SLI / E001). App default label `service` may appear as `exported_service` after scrape — do not rely on it for this protocol.

| Parameter | Value |
|-----------|-------|
| Sampling window | **30 seconds** |
| Success threshold **X** (`X_success`) | **99%** (frozen; E000-R6/R7/R8 observed healthy success = 100%) |
| Conjunction | Both conditions must hold **in the same window** before that window counts |
| Evaluation | **2 of 3** rolling windows with `recovery_window_i == true` → **SUCCESSFUL RECOVERY** |

**Outcome classes (after 2-of-3 on the corresponding predicate):**

| Class | Per-window predicate (must hold in ≥ 2 of latest 3) | Timestamp |
|-------|-----------------------------------------------------|-----------|
| **SUCCESSFUL RECOVERY** | `p95 < 500` **∧** `success ≥ 99%` | **T3** |
| **PERFORMANCE CONTAINMENT** | `p95 < 500` **∧** `success < 99%` | **T3c** |
| **NOT RECOVERED** | `p95 ≥ 500` **∧** `success ≥ 99%` | — |
| **DEGRADED** | `p95 ≥ 500` **∧** `success < 99%` | — |

Do **not** apply 2-of-3 separately to latency and availability and then AND the two M-of-N results. That would allow mismatched windows (e.g. latency OK in W1/W2, success OK in W2/W3) to falsely declare recovery.

Under F01 (+2000 ms) + R01 `timeout_ms = 300`, the **expected** class is **PERFORMANCE CONTAINMENT**. That is a valid scientific outcome, not a failed experiment.

### 4.2 Run validity (self-healing attribution)

For T3 / T3c attribution:

```text
fault_injection_active = 1
AND remediation_active = 1
AND outcome class evaluated under §4.1
```

If the fault was cleared via FaultController, the run is **INVALID** for self-healing claims.

---

## 5. Experimental timestamps

| Symbol | Meaning |
|--------|---------|
| **T0** | Fault activation |
| **T1** | Degradation detected (2-of-3 latency rule first satisfied) |
| **T2** | Remediation action initiated (R01 activated) |
| **T3** | **SUCCESSFUL RECOVERY** first satisfied (§4.1) |
| **T3c** | **PERFORMANCE CONTAINMENT** first satisfied (§4.1) |

```text
TTD  = T1 − T0
TTR  = T3 − T0     (only if SUCCESSFUL RECOVERY)
TTRc = T3c − T0    (containment latency from fault start)
```

Action / decision latency companions:

```text
T2 − T1     decision/action latency after degradation
T3 − T2     time from action to successful recovery (if any)
T3c − T2    time from action to containment (if any)
```

Timeline:

```text
T0 ── fault
 │
 ▼
T1 ── degradation detected
 │
 ▼
T2 ── remediation (R01)
 │
 ├───────────────► T3     SUCCESSFUL RECOVERY
 │
 └───────────────► T3c    PERFORMANCE CONTAINMENT
```

### E001 characterization run (no AI)

E001 has **no** self-healing. Timestamps:

| Timestamp | Meaning for E001 |
|-----------|------------------|
| **T0** | Fault activated (FaultController) |
| **T1** | Degradation detected (2-of-3 primary SLI rule) |
| **T2** | **N/A** — no self-healing action |
| **T3** | Latency-only recovery after **manual** fault deactivation (§4.0) |
| **T3c** | **N/A** |

E001 establishes `fault → degradation → fault removal → recovery`. Do **not** invent T2 or T3c for E001. Record T3 only when the E001 latency recovery rule is first satisfied after deactivation — that T3 is **not** self-healing attribution.

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

## 10. E002 / E003 design freeze (remediation — not yet executed)

| Field | Value |
|-------|-------|
| Remediation | **R01 — Runtime Dependency Timeout** ([`remediation-r01.md`](remediation-r01.md)) |
| E002 / E003 timeout | **`timeout_ms = 300` ms** (fixed; AI does **not** choose) |
| Actuator bounds | **250 ms ≤ timeout_ms ≤ 450 ms** |
| Availability | **`X_success = 99%`** (§4.1) |
| Actuator implementation | Not implemented |
| Execution | E002 / E003 not executed |
| Characterization | [`r01-parameter-characterization.md`](r01-parameter-characterization.md) |
| Forbidden remediation | Mutating `/faults*` / FaultController (R01b fallback → E005) |
| E002 | Embedded AI + R01 (`timeout_ms = 300`) |
| E003 | External Agent + R01 (`timeout_ms = 300`) |
| Expected class under F01+R01 | **PERFORMANCE CONTAINMENT** |

Timeout justification (observed only): pooled healthy payment p99 = **164.2 ms**; max per-run p99 = **187.8 ms**; `300 > 187.8` and `300 < 500`.

Later (not E002 / E003):

| ID | Focus |
|----|-------|
| E004 | **R01-adaptive** — AI chooses `timeout_ms ∈ [250, 450]` ms (decision quality) |
| E005 | R01b fallback / capability shedding (full recovery study) |

---

## 11. Future AI comparison metrics (measurement model only)

See [`ai-comparison-metrics.md`](ai-comparison-metrics.md).

---

## Related documents

- [`remediation-r01.md`](remediation-r01.md)  
- [`r01-parameter-characterization.md`](r01-parameter-characterization.md)  
- [`recovery-criteria.md`](recovery-criteria.md)  
- [`metrics.md`](metrics.md)  
- [`experimental-protocol.md`](experimental-protocol.md)  
- [`../experiments/E001/README.md`](../experiments/E001/README.md)  
- [`../load-testing/experiments/E000-REPEATS.md`](../load-testing/experiments/E000-REPEATS.md)  
- [`../docs/observability.md`](../docs/observability.md)  
- Grafana: [`../infrastructure/k3s/grafana/`](../infrastructure/k3s/grafana/)
