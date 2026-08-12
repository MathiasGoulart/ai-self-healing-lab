# R01 — Runtime Dependency Timeout (Containment)

**Document type:** Experimental protocol (remediation freeze for E002+)  
**Status:** Parameters frozen — **actuator implemented** in Order Service; E002/E003 **not executed**  
**Date:** 2026-08-12  
**Characterization:** [`r01-parameter-characterization.md`](r01-parameter-characterization.md)

```text
R01:                 Runtime Dependency Timeout
E002/E003:           timeout_ms = 300 ms (fixed; AI must NOT choose)
Actuator bounds:     250 ms ≤ timeout_ms ≤ 450 ms
Availability:        success ≥ 99%  (X_success)
E004:                AI-selected timeout within [250, 450] ms
```

This document freezes the first legitimate self-healing remediation for F01 (payment latency). It is intentionally **not** fault deactivation.

### Frozen parameters

| Parameter | Value |
|-----------|------:|
| `timeout_ms` (E002 / E003 fixed) | **300** |
| `Tmin` | **250** |
| `Tmax` | **450** |
| `X_success` (availability guardrail) | **99%** |

Canonical outcome taxonomy: [`protocol-freeze.md`](protocol-freeze.md) §4.1 · [`recovery-criteria.md`](recovery-criteria.md).

---

## 1. Research question for E002 / E003

> Does the placement of intelligence — inside the application (Embedded AI) or in an external agent — influence the ability to detect and mitigate a dependency-induced latency degradation?

Held constant:

```text
same application
same fault (F01 medium, +2000 ms)
same health information model
same remediation (R01)
same fixed timeout parameter (300 ms)
same success criteria (X_success = 99%)
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
AI activates runtime timeout configuration (fixed 300 ms)
     ↓
system adapts
     ↓
latency contained (availability may drop)
```

For **E002 / E003**, the timeout **value** is fixed by protocol at **300 ms**. The AI decides **whether / when** to activate R01 — not which millisecond value to use.

Naming note: do **not** call E002/E003 “adaptive timeout.” Adaptive **parameter** selection is **E004 — R01-adaptive**.

---

## 4. Fixed parameter (E002 / E003)

| Parameter | Value |
|-----------|------:|
| `timeout_ms` | **300** (identical for Embedded and External) |

### Justification (observed baseline only)

From [`r01-parameter-characterization.md`](r01-parameter-characterization.md) on E000-R6/R7/R8 `payment_request_duration_seconds`:

| Statistic | Value |
|-----------|------:|
| Pooled healthy payment p99 | **164.2 ms** |
| Max of per-run healthy p99 | **187.8 ms** |

```text
timeout_ms = 300
  > max(per-run p99) = 187.8 ms
  > pooled p99 = 164.2 ms
  < 500 ms          (latency SLI threshold)
  ≪ 2000 ms         (F01 medium injection)
```

Do **not** claim a quantitative healthy false-timeout rate from histogram buckets alone: the (250 ms, 500 ms] bucket does not resolve how many samples exceed exactly 300 ms. Justification is limited to the observed p99 statistics above.

Do **not** confuse baselines:

```text
k6 order_flow p95 (≈ 288–306 ms on R6–R8)
        ≠
order_processing p95 (server-side)
        ≠
payment_request_duration p99 (164.2 ms pooled — used here)
```

### Future experiment (out of scope for E002)

**E004 — R01-adaptive:** AI chooses `timeout_ms ∈ [Tmin, Tmax]` = `[250, 450]` to study remediation decision quality. Separate IV; not mixed into E002/E003.

---

## 5. Actuator safety bounds

Even with a fixed protocol value, the actuator enforces:

```text
Tmin ≤ timeout_ms ≤ Tmax
250  ≤ timeout_ms ≤ 450
```

| Bound | Value | Derivation |
|-------|------:|------------|
| **Tmin** | **250 ms** | Above healthy payment p99 (pooled 164.2 ms; max per-run 187.8 ms). Blocks `timeout_ms = 1` and other sub-tail gaming. |
| **Tmax** | **450 ms** | Below the 500 ms latency threshold (50 ms margin). Blocks `timeout_ms ≥ 500` / effectively disabling containment relative to the SLI. |

E002/E003 fixed value **300** ∈ `[250, 450]`.

---

## 6. Shared actuator (fairness)

Both placements execute the **same** remediation through the **same** abstraction:

```text
Embedded AI ─────┐
                 ▼
        RemediationService      ← common abstraction (Order Service)
                 │
                 ▼
       RemediationController
                 │
                 ▼
          PaymentClient

External Agent / ops ──► HTTP /remediation* ──► RemediationService (same path)
```

| Placement | Role |
|-----------|------|
| Embedded AI | Decides; invokes **RemediationService** in-process |
| External Agent | Decides; invokes the **same** service via HTTP adapter |

Do **not** give Embedded a private shortcut that External cannot use. Decision origin differs; actuation path is shared.

### HTTP adapter (ClusterIP / internal only)

```text
GET    /remediation
POST   /remediation/payment_timeout   { "enabled": true, "timeout_ms": 300 }
DELETE /remediation/payment_timeout
```

Order Service **ClusterIP only** — **no public Ingress** (same rule as Payment Service `/faults*`). Access via in-cluster DNS or `kubectl port-forward`.

Implementation: [`../application/order-service/src/remediation/`](../application/order-service/src/remediation/)

`setPaymentTimeout(timeout_ms)` accepts any value in `[250, 450]`; E002/E003 callers pass the fixed constant **300**.

---

## 7. Expected outcome under F01

With F01 = +2000 ms on every payment and R01 `timeout_ms = 300`:

```text
latency p95     ↓  (containment)
success rate    ↓  (payments abort)
```

**R01 is not expected to restore the original business outcome rate under F01; it is intended to bound dependency-induced latency at the cost of controlled request failure.**

A falling success rate is therefore an **expected consequence of the remediation**, not a bug in the experiment or an implementation error.

**Expected classification: PERFORMANCE CONTAINMENT** — not experimental failure.

Successful recovery (latency ∧ availability) is **not** expected from timeout-only remediation while F01 remains active and success requires a real payment approval. Full recovery / fallback (R01b) is deferred to a later experiment (E005).

---

## 8. Availability guardrail (frozen in protocol-freeze)

Outcome classification uses [`protocol-freeze.md`](protocol-freeze.md) §4.1 — conjunction **per window**, then 2-of-3:

```text
recovery_window_i =
    (p95_i < 500 ms)
    AND
    (success_rate_i >= 99%)

SUCCESSFUL RECOVERY =
    count(recovery_window_i == true) >= 2
    over the latest 3 windows

success_rate_i =
  sum(rate(orders_processing_total{job="order-service",result="success"}[30s]))
  /
  sum(rate(orders_processing_total{job="order-service"}[30s]))

X_success = 99%
```

| Class | Per-window predicate (≥ 2 of latest 3) |
|-------|----------------------------------------|
| SUCCESSFUL RECOVERY (T3) | `p95 < 500` ∧ `success ≥ 99%` |
| PERFORMANCE CONTAINMENT (T3c) | `p95 < 500` ∧ `success < 99%` |
| NOT RECOVERED | `p95 ≥ 500` ∧ `success ≥ 99%` |
| DEGRADED | `p95 ≥ 500` ∧ `success < 99%` |

---

## 9. Observability (required for valid runs)

| Signal | Role |
|--------|------|
| `fault_injection_active{fault="payment_latency"}` | Fault still ON (ground truth) |
| `remediation_active{action="payment_timeout"}` | R01 engaged (T2 evidence) |
| `remediation_payment_timeout_ms` | Configured timeout (0 when inactive) |
| `payment_timeouts_total` | Timeout cutting dependency waits |
| `order_processing_duration_seconds` | Latency SLI |
| `orders_processing_total{result}` | Input to availability guardrail (§8) |

Future **k3s smoke / E002 preflight** must assert coexistence:

```text
fault_injection_active{fault="payment_latency"} = 1
remediation_active{action="payment_timeout"} = 1
```

This proves R01 does **not** deactivate F01. Local e2e uses a mock payment server without FaultController and cannot assert this pair.

Experiment identity stays in annotations / artifacts — not high-cardinality labels.

---

## 10. Experiment line

| ID | Purpose | AI | Remediation |
|----|---------|----|-------------|
| E000 | Baseline | None | None |
| E001 | Fault characterization | None | Manual fault off |
| **E002** | Embedded containment | Embedded | **R01 timeout = 300 ms** |
| **E003** | External containment | External | **R01 timeout = 300 ms** |
| E004 | Decision quality | Either / both | **R01-adaptive** (`250`–`450`) |
| E005 | Full recovery / shedding | TBD | R01b (circuit + fallback) — separate study |

Separated research questions:

| Experiments | Question |
|-------------|----------|
| E002 / E003 | Does **placement** affect detection and mitigation? |
| E004 | Does the AI make better **remediation parameter** decisions? |
| E005 | Can the system achieve **functional recovery** despite dependency failure? |

---

## 11. Explicitly out of scope for R01 / E002

- Mutating FaultController / `/faults*`
- Fallback approval / stub PAID (capability shedding)
- Circuit-breaker half-open policies beyond the fixed timeout
- AI-chosen `timeout_ms` (E004 — R01-adaptive)
- Declaring recovery from latency alone
- Public Ingress for `/remediation*` (ClusterIP / port-forward only)

---

## Related documents

- Parameter characterization: [`r01-parameter-characterization.md`](r01-parameter-characterization.md)  
- Outcome taxonomy, T3 / T3c, availability guardrail: [`protocol-freeze.md`](protocol-freeze.md)  
- Recovery criteria: [`recovery-criteria.md`](recovery-criteria.md)  
- Fault F01: [`fault-matrix.md`](fault-matrix.md), [`../fault-injector/README.md`](../fault-injector/README.md)  
- Comparison metrics: [`ai-comparison-metrics.md`](ai-comparison-metrics.md)  
- E001 results: [`../load-testing/experiments/E001/RESULTS.md`](../load-testing/experiments/E001/RESULTS.md)
