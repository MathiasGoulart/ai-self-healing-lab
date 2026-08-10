# Metrics

**Document type:** Formal metric definitions (research protocol)  
**Status:** Definitions fixed for protocol; thresholds derived later from baseline

Self-healing effectiveness is measured across detection, diagnosis, recovery, application impact, and runtime overhead. Client-side (k6) and system-side (Prometheus) perspectives are complementary — see Observability section below.

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
TTD =
  timestamp(anomaly detected)
  −
  timestamp(fault injected)
```

### Requirements

1. The **fault injector** must emit a precise **fault start** timestamp (UTC).
2. The **self-healing mechanism** must emit a precise **detection** timestamp (UTC).
3. Both timestamps must be correlatable to the same experiment ID and fault injection record.

### Notes

- TTD measures detection latency of the self-healing loop, not the first client-visible error in k6 (unless the mechanism explicitly uses that signal as its detection event — which must be documented per implementation).
- Clock synchronization expectations (NTP / shared cluster time) must be stated in each experiment artifact.

---

## Time to Recovery — TTR

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

An action is an **Execute** step. Recovery is a **state** of the application relative to predefined criteria ([`recovery-criteria.md`](recovery-criteria.md)).

### Requirements

1. Recovery criteria must be objective and derived from baseline envelopes.
2. The recovery timestamp is the earliest time at which the criteria remain satisfied for the required recovery window (e.g. *N* consecutive seconds).
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

- Recovery criteria framework: [`recovery-criteria.md`](recovery-criteria.md)
- Future self-healing metric names: [`self-healing-metrics.md`](self-healing-metrics.md)
- Baseline / comparison protocol: [`experimental-protocol.md`](experimental-protocol.md)
