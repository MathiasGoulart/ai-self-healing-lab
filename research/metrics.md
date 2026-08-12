# Metrics

**Document type:** Formal metric definitions (research protocol)  
**Status:** Definitions frozen for E001+ — see [`protocol-freeze.md`](protocol-freeze.md)

Self-healing effectiveness is measured across detection, diagnosis, recovery, application impact, and runtime overhead. Client-side (k6) and system-side (Prometheus) perspectives are complementary — see Observability section below.

---

## Primary SLI (authoritative)

| Field | Value |
|-------|-------|
| Name | Order processing latency p95 |
| Service | order-service |
| Metric | `order_processing_duration_seconds` |
| Aggregation | `histogram_quantile(0.95, …)` over **30s** windows |

**Prometheus = authoritative operational SLI** for HEALTHY / DEGRADED.  
**k6 = client-facing experiment measurements** (not authoritative degradation state).

---

## Independent variable

| Variable | Levels |
|----------|--------|
| AI architectural placement | Embedded · External |

---

## Controlled variables

When comparing Embedded vs External, hold constant:

- Application source version
- Container image version (immutable `sha-*` tag or digest — **never** `latest` as experimental metadata)
- Payment Service version
- Database version / configuration
- Kubernetes configuration
- CPU / memory resources
- Number of replicas
- k6 workload (scenario, rate, duration, VUs, timeout)
- Workload duration
- Workload rate
- Fault type
- Fault severity
- Fault duration
- Network environment

---

## Dependent variables

### Detection

| Variable | Symbol |
|----------|--------|
| Time to Detection | TTD |

### Diagnosis

| Variable |
|----------|
| Root Cause Accuracy |
| False Positive Rate |
| False Negative Rate |

### Recovery

| Variable | Symbol |
|----------|--------|
| Time to Recovery | TTR |
| Recovery Success Rate | — |

### Application impact

| Variable | Typical source |
|----------|----------------|
| Throughput | k6 + Prometheus |
| HTTP p50 / p95 / p99 | k6 + Prometheus |
| Error Rate | k6 + Prometheus |
| Business Flow Latency | k6 `order_flow_duration` |

### Runtime overhead

| Variable | Typical source |
|----------|----------------|
| CPU | Prometheus |
| Memory | Prometheus |
| Event Loop Delay | Prometheus |
| GC behavior | Prometheus / runtime metrics (when available) |

---

## Time to Detection — TTD

```text
TTD = T1 − T0
```

where:

| Symbol | Meaning |
|--------|---------|
| T0 | Fault activation (FaultController) |
| T1 | Degradation detected (2-of-3 primary SLI rule) |
| T2 | Recovery action initiated |
| T3 | Recovery confirmed (2-of-3 recovery rule) |

```text
TTD =
  timestamp(anomaly detected)
  −
  timestamp(fault injected)
```

### Requirements

1. The **fault injector** must emit a precise **fault start** timestamp (UTC) — FaultController is ground truth for fault occurrence.
2. Detection (T1) follows the frozen objective rule in [`protocol-freeze.md`](protocol-freeze.md) / [`recovery-criteria.md`](recovery-criteria.md).
3. Both timestamps must be correlatable to the same experiment ID and fault injection record.

### Notes

- TTD is defined against the **server-side** primary SLI rule, not the first client-visible k6 slow request (unless an implementation explicitly documents that as its detection event).
- Clock synchronization expectations (NTP / shared cluster time) must be stated in each experiment artifact.
- For initial E001 characterization (no AI): **T2 is N/A**; **T3 is recorded** as observed recovery after manual fault deactivation (2-of-3 rule), not as self-healing recovery.

---

## Time to Recovery — TTR

```text
TTR = T3 − T0
```

```text
TTR =
  timestamp(recovery criteria satisfied)
  −
  timestamp(fault injected)
```

### What recovery is **not**

```text
AI issued an action
```

An action is an **Execute** step (T2). Recovery is a **state** (T3) relative to predefined criteria ([`recovery-criteria.md`](recovery-criteria.md)): **2 of 3** thirty-second windows with order-processing p95 **<** 500 ms.

### Requirements

1. Recovery criteria are the frozen objective rules (not subjective dashboards).
2. T3 is the earliest time at which the 2-of-3 recovery rule is satisfied.
3. If criteria are never satisfied within the experiment recovery deadline, the run is a **recovery failure** (TTR may be recorded as censored / undefined per analysis plan).

---

## Diagnosis metrics (definitions)

### Root Cause Accuracy

Fraction of injected faults for which the mechanism’s diagnosis matches the **true fault class / target component** (from the fault injection record), under the labeling scheme in [`fault-matrix.md`](fault-matrix.md).

### False Positive Rate

Rate of detection/diagnosis events that assert a fault when **no** matching injected fault is active (exact operationalization fixed in the analysis plan).

### False Negative Rate

Rate of injected faults with **no** valid detection (and/or correct diagnosis — specify per analysis table) within the observation window.

---

## Recovery Success Rate

```text
Recovery Success Rate =
  (# runs where recovery criteria satisfied within recovery window)
  /
  (# eligible injected-fault runs)
```

Subjective judgments (“the graph looks normal”) are **invalid**.

---

## Observability perspectives

### External / client (k6)

What the client experienced:

- HTTP latency
- HTTP errors
- Iteration duration
- Iteration success / failure
- Throughput (iterations/s and HTTP RPS)

### Internal / system (Prometheus)

What happened inside the system:

- HTTP request metrics
- Orders / payment metrics
- Database pool
- CPU / memory
- Event loop
- GC (when instrumented)

Application Prometheus metrics **must remain** available: the external agent depends on system telemetry. Experiment IDs must **not** be added as high-cardinality Prometheus labels.

---

## Related

- Protocol freeze: [`protocol-freeze.md`](protocol-freeze.md)
- Recovery criteria: [`recovery-criteria.md`](recovery-criteria.md)
- AI comparison metrics: [`ai-comparison-metrics.md`](ai-comparison-metrics.md)
- Future self-healing metric names: [`self-healing-metrics.md`](self-healing-metrics.md)
- Baseline / comparison protocol: [`experimental-protocol.md`](experimental-protocol.md)
