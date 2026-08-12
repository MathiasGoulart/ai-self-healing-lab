# R01 — Runtime Dependency Timeout (Containment)

**Document type:** Experimental protocol (remediation design for E002+)  
**Status:** Design frozen; parameterization pending baseline characterization — **not implemented**  
**Date:** 2026-08-12

This document freezes the **design** of the first legitimate self-healing remediation for F01 (payment latency). It is intentionally **not** fault deactivation.

**Not fully frozen until:**

```text
timeout_ms = X
Tmin, Tmax
availability threshold X_success (protocol-freeze)
```

are derived from healthy payment-latency characterization (E000-R6/R7/R8 and/or E001 HEALTHY windows). Do **not** implement R01 or choose X arbitrarily before that step.

Canonical outcome taxonomy and availability guardrail: [`protocol-freeze.md`](protocol-freeze.md) §4.1 · [`recovery-criteria.md`](recovery-criteria.md).

---

## 1. Research question for E002 / E003

> Does the placement of intelligence — inside the application (Embedded AI) or in an external agent — influence the ability to detect and mitigate a dependency-induced latency degradation?

Held constant:

```text
same application
same fault (F01 medium, +2000 ms)
same health information model
same remediation (R01)
same fixed timeout parameter
same success criteria
```

Independent variable:

```text
AI architectural placement = Embedded | External
```

---

## 2. Why not DELETE /faults/payment_latency

Removing the injected fault via the FaultController would invalidate the experiment:

```text
AI → DELETE /faults/payment_latency
```

That is **experiment control**, not self-healing. Fault ground truth remains the FaultController; the AI must **not** mutate fault injection state.

Invalidation rule for E002+:

```text
If fault_injection_active{fault="payment_latency"} becomes 0
during the T2 → T3 / T3c observation window
⇒ run INVALID for self-healing attribution
```

---

## 3. Remediation definition

| Field | Value |
|-------|-------|
| ID | **R01** |
| Name | **Runtime dependency timeout** |
| Target | Order Service → Payment Service client call |
| Effect | Bound wait time on `POST /payments`; on expiry, fail the payment call (fail-fast) |
| Semantic change | Orders may transition to **FAILED** instead of waiting for a slow **PAID** |
| Fault state | **Unchanged** (F01 remains active) |

### What is dynamic in E002 / E003

Timeout is a classical resilience mechanism. What makes R01 a **self-healing** action in this study is runtime activation via the MAPE-K loop:

```text
AI detects anomaly
     ↓
AI decides R01 is appropriate
     ↓
AI activates runtime timeout configuration (fixed X)
     ↓
system adapts
     ↓
latency contained (availability may drop)
```

For **E002 / E003**, the timeout **value** is fixed by protocol. The AI decides **whether / when** to activate R01 — not which millisecond value to use.

Naming note: do **not** call E002/E003 “adaptive timeout.” Adaptive **parameter** selection is **E004 — R01-adaptive**.

---

## 4. Fixed parameter (E002 / E003)

| Parameter | Value |
|-----------|-------|
| `timeout_ms` | **Fixed constant X** (same for Embedded and External) |
| Choice of X | **Pending** — must follow the characterization sequence below |

### Characterization sequence (required before implementation)

```text
E000 R6 / R7 / R8  (+ optional E001 HEALTHY windows)
        │
        ▼
payment_request_duration_seconds (healthy)
        │
        ├── p50
        ├── p95
        ├── p99
        └── max
        │
        ▼
choose X, Tmin, Tmax
```

### Constraints on X

```text
X < 500 ms
    must be able to move primary latency SLI under the degradation threshold

X must be sufficiently above the healthy payment latency tail
    to avoid material false timeouts during normal operation
```

The second constraint is qualitative until the distribution is measured. After characterization, freeze a **quantitative** rule if the data permit (e.g. a multiple of healthy p99, or a fixed margin above p99/max), then publish X / Tmin / Tmax. Do **not** pre-freeze values such as 300 ms.

Do **not** confuse baselines:

```text
k6 order_flow p95 (≈ 288–306 ms on R6–R8)
        ≠
order_processing p95 (server-side; E001 healthy windows ≈ 50–90 ms)
        ≠
payment_request_duration p95 (client-side dependency; to be measured)
```

Timeout selection uses **payment** latency distribution, not k6 order-flow p95.

### Future experiment (out of scope for E002)

**E004 — R01-adaptive:** AI chooses `timeout_ms ∈ [Tmin, Tmax]` to study remediation decision quality. Separate IV; not mixed into E002/E003.

---

## 5. Actuator safety bounds

Even with a fixed protocol value, the actuator enforces:

```text
Tmin ≤ timeout_ms ≤ Tmax
```

| Purpose | Example abuse blocked |
|---------|------------------------|
| Lower bound | `timeout_ms = 1` gaming latency SLI |
| Upper bound | `timeout_ms = 999999` effectively disabling the remediation |

`Tmin` / `Tmax` are frozen after payment-tail characterization (same artifact pass as X).

---

## 6. Shared actuator (fairness)

Both placements execute the **same** remediation through the **same** abstraction:

```text
RemediationController
        │
        └── setPaymentTimeout(timeout_ms) / clearPaymentTimeout()
```

| Placement | Role |
|-----------|------|
| Embedded AI | Decides; invokes the shared remediation API / service |
| External Agent | Decides; invokes the **same** remediation API / service |

Do **not** give Embedded a private in-process shortcut that External cannot use. Decision origin differs; actuation path is shared.

Conceptual control surface (to be implemented later):

```text
GET    /remediation
POST   /remediation/payment_timeout   { "enabled": true, "timeout_ms": X }
DELETE /remediation/payment_timeout
```

---

## 7. Expected outcome under F01

With F01 = +2000 ms on every payment and R01 timeout ≪ 2000 ms:

```text
latency p95     ↓  (containment)
success rate    ↓  (payments abort)
```

**R01 is not expected to restore the original business outcome rate under F01; it is intended to bound dependency-induced latency at the cost of controlled request failure.**

A falling success rate is therefore an **expected consequence of the remediation**, not a bug in the experiment or an implementation error.

**Expected classification: PERFORMANCE CONTAINMENT** — not experimental failure.

Successful recovery (latency ∧ availability) is **not** expected from timeout-only remediation while F01 remains active and success requires a real payment approval. Full recovery / fallback (R01b) is deferred to a later experiment (E005).

---

## 8. Availability guardrail (reference — do not redefine here)

R01 does **not** redefine recovery success. Outcome classification uses the frozen dual rule in [`protocol-freeze.md`](protocol-freeze.md) §4.1:

```text
success_rate =
  successful order-processing rate
  over the same 30 s evaluation window

PromQL (canonical):
  sum(rate(orders_processing_total{job="order-service",result="success"}[30s]))
  /
  sum(rate(orders_processing_total{job="order-service"}[30s]))

X_success (availability threshold) =
  derived from E000 controlled baseline
  (candidate 99% in protocol-freeze; finalize with characterization)
```

| Latency (2-of-3) | Success ≥ X_success | Class |
|------------------|---------------------|-------|
| p95 < 500 ms | yes | SUCCESSFUL RECOVERY (T3) |
| p95 < 500 ms | no | PERFORMANCE CONTAINMENT (T3c) |
| p95 ≥ 500 ms | yes | NOT RECOVERED |
| p95 ≥ 500 ms | no | DEGRADED |

Until `X_success`, `timeout_ms`, and actuator bounds are published from baseline characterization, this remediation design is **not** complete for execution.

---

## 9. Observability (required for valid runs)

| Signal | Role |
|--------|------|
| `fault_injection_active{fault="payment_latency"}` | Fault still ON (ground truth) |
| `remediation_active{action="payment_timeout"}` | R01 engaged (T2 evidence) |
| `payment_timeouts_total` | Timeout cutting dependency waits |
| `order_processing_duration_seconds` | Latency SLI |
| `orders_processing_total{result}` | Input to availability guardrail (§8 / protocol-freeze) |

Experiment identity stays in annotations / artifacts — not high-cardinality labels.

---

## 10. Experiment line

| ID | Purpose | AI | Remediation |
|----|---------|----|-------------|
| E000 | Baseline | None | None |
| E001 | Fault characterization | None | Manual fault off |
| **E002** | Embedded containment | Embedded | **R01 fixed timeout** |
| **E003** | External containment | External | **R01 fixed timeout** |
| E004 | Decision quality | Either / both | **R01-adaptive** (`Tmin`–`Tmax`) |
| E005 | Full recovery / shedding | TBD | R01b (circuit + fallback) — separate study |

Separated research questions:

| Experiments | Question |
|-------------|----------|
| E002 / E003 | Does **placement** affect detection and mitigation? |
| E004 | Does the AI make better **remediation parameter** decisions? |
| E005 | Can the system achieve **functional recovery** despite dependency failure? |

E002 and E003 are a **paired placement comparison**. E004 and E005 must not be conflated with E002.

---

## 11. Explicitly out of scope for R01 / E002

- Mutating FaultController / `/faults*`
- Fallback approval / stub PAID (capability shedding)
- Circuit-breaker half-open policies beyond the fixed timeout
- AI-chosen `timeout_ms` (E004 — R01-adaptive)
- Declaring recovery from latency alone
- Choosing `timeout_ms` before payment-tail characterization

---

## Related documents

- Outcome taxonomy, T3 / T3c, availability guardrail: [`protocol-freeze.md`](protocol-freeze.md)  
- Recovery criteria: [`recovery-criteria.md`](recovery-criteria.md)  
- Fault F01: [`fault-matrix.md`](fault-matrix.md), [`../fault-injector/README.md`](../fault-injector/README.md)  
- Comparison metrics: [`ai-comparison-metrics.md`](ai-comparison-metrics.md)  
- E001 results: [`../load-testing/experiments/E001/RESULTS.md`](../load-testing/experiments/E001/RESULTS.md)
