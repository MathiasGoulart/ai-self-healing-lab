# Experimental Protocol

**Document type:** Experimental protocol  
**Status:** Protocol defined; comparative AI experiments not yet executable

---

## Research objective

Evaluate the effect of **AI architectural placement** (Embedded vs External) on self-healing effectiveness under controlled faults and identical workload.

Primary comparison design:

```text
                 Embedded       External
                 AI             Agent
                 │              │
Same fault ──────┼──────────────┼──────
Same workload ───┼──────────────┼──────
Same duration ───┼──────────────┼──────
Same infra ──────┼──────────────┼──────
Same app version ┼──────────────┼──────
                 │              │
                 ▼              ▼
               Results
```

One approach per run (unless a separate interaction study is explicitly defined).

---

## Independent variable

| Variable | Levels |
|----------|--------|
| AI architectural placement | Embedded · External |

---

## Controlled variables

Must remain constant across paired Embedded/External comparisons:

| Category | Controls |
|----------|----------|
| Software | Application source version; Order Service image; Payment Service image; DB version/config |
| Platform | Kubernetes/k3s configuration; CPU/memory requests/limits; replica counts |
| Workload | k6 scenario; rate; duration; VUs; request timeout |
| Fault | Fault ID; severity; duration; parameters; target component |
| Environment | Network path used for load generation; observability stack configuration |

**Image metadata rule:** record immutable commit tags (`sha-*`) or digests. Never record only `latest`.

---

## Dependent variables

See [`metrics.md`](metrics.md) and [`questions.md`](questions.md):

- Detection: TTD  
- Diagnosis: Root Cause Accuracy, FPR, FNR  
- Recovery: TTR, Recovery Success Rate  
- Application impact: throughput, HTTP percentiles, error rate, business-flow latency  
- Overhead: CPU, memory, event-loop delay, GC behavior  

---

## Baseline family — E000 (no fault)

### Purpose

Characterize **normal** system behavior. One exploratory run is insufficient for the final statistical baseline.

### Configuration (fixed across repetitions)

| Field | Value |
|-------|-------|
| Experiment family | E000 |
| Condition | No fault |
| Workload | create → process (`load-testing/scenarios/baseline.js`) |
| Arrival rate | 10 iterations/second |
| Duration | 10 minutes |
| Faults | None |

### Required repetitions

```text
E000-R1
E000-R2
E000-R3
E000-R4
E000-R5
```

Identical configuration for every repetition. Do **not** change workload parameters between runs.

An existing exploratory `E000/` artifact and R1–R5 exist. **R6–R8 are the primary controlled baseline dataset.** R3–R5 are preserved but classified as potentially confounded (load-generator power-saving). See [`protocol-freeze.md`](protocol-freeze.md) and [`../load-testing/experiments/E000-REPEATS.md`](../load-testing/experiments/E000-REPEATS.md).

### Per-run recording checklist

| Field | Required |
|-------|----------|
| Application (Order Service) image | yes (`sha-*` / digest) |
| Payment Service image | yes |
| k6 version | yes |
| k6 configuration (RATE, DURATION, VUs, timeout, BASE_URL) | yes |
| Start time (UTC) | yes |
| End time (UTC) | yes |
| Rate / duration | yes |
| CPU | yes (Prometheus) |
| Memory | yes |
| HTTP latency (client + system as available) | yes |
| Business-flow latency (k6) | yes |
| Error rate | yes |
| Database pool | yes |
| Event-loop delay | yes |
| Payment latency | yes |
| Result locations (`summary.json`, HTML report, Grafana window) | yes |

### Baseline statistics (analysis phase — not implemented here)

For primary baseline metrics, eventually compute:

```text
mean, median, standard deviation,
p50, p95, p99,
minimum, maximum
```

Do **not** implement statistical analysis in this documentation phase.

---

## Fault injection metadata requirements

Every injected fault run must record:

```text
experiment ID
fault ID
severity
start timestamp
end timestamp
target component
fault parameters
```

Example:

```text
Experiment: E001
Fault: F01
Target: payment-service
Severity: medium
Parameter: +2s latency
Start: <UTC timestamp>
End: <UTC timestamp>
```

These timestamps are mandatory inputs to TTD and TTR ([`metrics.md`](metrics.md)).

Fault classes: [`fault-matrix.md`](fault-matrix.md).

---

## Comparative experiment repetitions

Each fault × severity × placement cell uses repeated runs, e.g.:

```text
F01 / medium

Embedded:  R1 R2 R3 R4 R5
External:  R1 R2 R3 R4 R5
```

Do not draw conclusions from a single run. Exact repetition count may be adjusted after a future statistical power analysis (not implemented now).

---

## Observation perspectives

| Perspective | Tool | Role |
|-------------|------|------|
| Client | k6 | External experience under the controlled workload |
| System | Prometheus (+ logs/traces) | Internal behavior; required for the external agent |

Grafana annotations (manual / dashboard convention): see [`protocol-freeze.md`](protocol-freeze.md) and E001 annotation tags (`E001_START`, `F01_ACTIVATED`, `F01_DEACTIVATED`, `E001_END`).

---

## Health evaluation (frozen)

Primary SLI, degradation, and recovery rules are frozen in:

- [`protocol-freeze.md`](protocol-freeze.md)
- [`recovery-criteria.md`](recovery-criteria.md)
- Remediation R01: [`remediation-r01.md`](remediation-r01.md)

Summary:

```text
Degradation (all):  order_processing p95 > 500 ms, 2-of-3 × 30s

E001 recovery:      p95 < 500 ms, 2-of-3          (latency only; executed)

E002+ SUCCESSFUL RECOVERY (T3):
  recovery_window_i = (p95_i < 500 ms) AND (success_rate_i >= 99%)
  count(recovery_window_i) >= 2 over latest 3 windows

E002+ PERFORMANCE CONTAINMENT (T3c):
  containment_window_i = (p95_i < 500 ms) AND (success_rate_i < 99%)
  count(containment_window_i) >= 2 over latest 3 windows
```

---

## E001 characterization (frozen — EXECUTED)

| Field | Value |
|-------|-------|
| Fault | F01 payment_latency / medium / +2000 ms |
| Workload | 10 iterations/s baseline |
| AI | None |
| Purpose | fault → degradation → fault removal → recovery |
| Results | [`../load-testing/experiments/E001/RESULTS.md`](../load-testing/experiments/E001/RESULTS.md) |

Observed (2026-08-11): TTD = 60 s; TTR = 240 s (manual deactivation; not self-healing).

---

## E002 / E003 design (frozen protocol — not executed)

| Field | Value |
|-------|-------|
| Fault | F01 medium / +2000 ms (remains active) |
| Remediation | **R01 — Runtime Dependency Timeout** |
| E002 / E003 timeout | **`timeout_ms = 300` ms** (fixed; AI does **not** choose) |
| Actuator bounds | **250 ms ≤ timeout_ms ≤ 450 ms** |
| Availability | **`X_success = 99%`** (success ≥ 99%) |
| Actuator / execution | Not implemented / not executed |
| E002 | Embedded AI |
| E003 | External Agent |
| Expected outcome | PERFORMANCE CONTAINMENT |
| Forbidden | FaultController `/faults*` as remediation; R01b fallback; AI-chosen timeout |
| Characterization | [`r01-parameter-characterization.md`](r01-parameter-characterization.md) |

See [`remediation-r01.md`](remediation-r01.md).

Later: **E004 — R01-adaptive** (AI chooses timeout ∈ `[250, 450]` ms); **E005** (fallback / full recovery).

---

## Preconditions for a valid comparative run (future)

1. Order Service, Payment Service, and PostgreSQL healthy  
2. Immutable image versions recorded  
3. k6 workload identical to the paired counterpart  
4. Fault injector configured with precise start/end timestamps  
5. Exactly one AI placement active  
6. Recovery criteria envelope published from baseline  
7. Telemetry scrape healthy for the experiment window  
8. Shared RemediationController available; FaultController **not** used as remediation  
9. R01 parameters frozen: `timeout_ms = 300`, `Tmin = 250`, `Tmax = 450`, `X_success = 99%`  

---

## Phased readiness (protocol view)

| Phase | Protocol relevance |
|-------|--------------------|
| 1–1.6 | Subject + metrics + k6 harness + exploratory E000 |
| Baseline repeats | E000-R1…R8; R6–R8 primary controlled baseline |
| 2A | Fault injector F01 |
| 2B | Protocol freeze (this document set) |
| E001 | Fault characterization (**executed** 2026-08-11) |
| R01 freeze | Runtime dependency timeout (`300` / `250`–`450`) + dual-outcome recovery + `X_success = 99%` (2026-08-12) |
| 3–4 | Embedded / External MAPE-K implementations |
| E002 / E003 | Paired containment comparison (R01 fixed) |
| E004 / E005 | Adaptive timeout; fallback / full recovery |
| 6 | Statistical analysis |

---

## Related

- Questions: [`questions.md`](questions.md)  
- Hypotheses: [`hypotheses.md`](hypotheses.md)  
- Recovery: [`recovery-criteria.md`](recovery-criteria.md)  
- Remediation R01: [`remediation-r01.md`](remediation-r01.md)  
- Fault matrix: [`fault-matrix.md`](fault-matrix.md)  
- Self-healing metrics (future): [`self-healing-metrics.md`](self-healing-metrics.md)  
