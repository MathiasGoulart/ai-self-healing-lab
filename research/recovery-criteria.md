# Recovery Criteria

**Document type:** Experimental protocol framework  
**Status:** Framework defined — **numeric thresholds not fixed yet**

---

## Principle

Recovery is declared only when the system returns to a **defined healthy operating envelope** derived from baseline measurements — not when an AI action is issued, and not by subjective dashboard inspection.

```text
baseline distribution
        ↓
acceptable operating envelope
        ↓
recovery criteria (+ recovery window)
```

---

## Candidate observable signals

SLO-like signals suitable for recovery evaluation:

| Signal | Perspective |
|--------|-------------|
| HTTP error rate | Client (k6) and/or system (Prometheus) |
| HTTP p95 latency | Client and/or system |
| Business-flow success rate | Client (k6 checks / iteration success) |
| Order processing success rate | System (`orders_processing_total` outcomes) |

Additional candidates (as needed per fault class):

- Payment request failure rate
- Database pool waiting / saturation indicators
- Event-loop delay relative to baseline

Which signal set is **primary** for a given fault will be specified in that experiment’s protocol entry (one primary set per fault family when possible).

---

## Recovery window

A future experiment defines a recovery window, for example:

```text
N consecutive seconds
```

during which **all** required criteria remain satisfied.

Example shape (thresholds TBD):

```text
Recovery at time t  iff  for all τ ∈ [t − N, t]:
  error_rate(τ)     ≤  E_max
  http_p95(τ)       ≤  L_max
  flow_success(τ)   ≥  S_min
```

`N`, `E_max`, `L_max`, and `S_min` are **not hard-coded here**.

---

## Deriving thresholds from baseline

1. Run repeated no-fault baselines (E000-R1 … E000-R5+) under identical workload ([`experimental-protocol.md`](experimental-protocol.md)).
2. Characterize distributions (mean, median, sd, p50, p95, p99, min, max) for candidate signals.
3. Define an **acceptable operating envelope** (e.g. within a chosen multiple of baseline variability, or below a chosen percentile bound).
4. Publish the envelope and recovery window in the experiment family documentation **before** comparative fault runs that depend on them.
5. Keep the same envelope when comparing Embedded vs External for that fault.

Changing thresholds mid-comparison invalidates the paired design.

---

## Recovery success vs failure

| Outcome | Condition |
|---------|-----------|
| **Success** | Criteria satisfied for the full recovery window, before the experiment’s recovery deadline |
| **Failure** | Deadline elapses without sustained criteria satisfaction |
| **Invalid run** | Fault injection metadata missing, workload misconfigured, or infrastructure confound |

TTR uses the timestamp when the recovery window is first completed ([`metrics.md`](metrics.md#time-to-recovery--ttr)).

---

## What is explicitly invalid

- “The graph looks normal”
- “The agent said it recovered”
- “We executed a remediation action”
- Thresholds invented without baseline evidence

---

## Status relative to current lab state

| Item | Status |
|------|--------|
| E000 single run | Initial exploratory baseline artifact exists |
| Repeated E000-R1…R5 | **Required** before locking recovery thresholds |
| Final `E_max` / `L_max` / `S_min` / `N` | **Deferred** until baseline statistics are available |
