# AI Comparison Metrics (Measurement Model)

**Document type:** Research protocol — measurement model  
**Status:** Frozen definitions — **not all instrumented yet**

These metrics will later compare **Embedded AI** vs **External Agent**. Definitions are frozen here; implementation may land in later phases.

---

## Detection

### TTD — Time To Detection

```text
TTD = anomaly detection time (T1) − fault activation time (T0)
```

T1 is determined by the frozen 2-of-3 degradation rule on the primary SLI ([`protocol-freeze.md`](protocol-freeze.md)).

---

## Diagnosis

### Root Cause Accuracy

Was the detected root cause correctly identified as the **F01 / payment dependency** fault (per FaultController ground truth)?

---

## Recovery

### TTR — Time To Recovery (successful)

```text
TTR = T3 − T0
```

**T3** requires **SUCCESSFUL RECOVERY** under the E002+ dual rule (latency p95 < 500 ms **and** success rate ≥ X, 2-of-3) — not merely issuing an action. See [`protocol-freeze.md`](protocol-freeze.md).

### TTRc — Time To Containment

```text
TTRc = T3c − T0
```

**T3c** is recorded when **PERFORMANCE CONTAINMENT** is first satisfied (latency recovered, availability guardrail violated).

### Decision / action latency

```text
T2 − T1     time from degradation detection to remediation initiation
T3 − T2     time from action to successful recovery (if any)
T3c − T2    time from action to containment (if any)
```

### Outcome class

One of: `SUCCESSFUL RECOVERY` | `PERFORMANCE CONTAINMENT` | `NOT RECOVERED` | `DEGRADED`.

Under F01 + R01 fixed timeout, **PERFORMANCE CONTAINMENT** is the expected class ([`remediation-r01.md`](remediation-r01.md)).

### Action Correctness

Was the recovery action appropriate relative to the fault and protocol (R01 activated; FaultController untouched; actuator bounds respected)?

---

## Stability

| Metric | Meaning |
|--------|---------|
| **False Positive Rate** | Declared DEGRADED when no matching fault was active |
| **False Negative Rate** | Failed to detect an active injected fault within the observation window |

---

## Performance overhead

### Embedded AI

- CPU overhead  
- Memory overhead  
- Latency overhead (application)  
- Event-loop overhead  

### External Agent

- Agent CPU  
- Agent memory  
- Decision latency  
- Observation / communication overhead  

---

## Safety

Track:

- incorrect actions  
- unnecessary actions  
- repeated actions  
- actions that worsen system state  

---

## Instrumentation note

Do **not** implement all of these metrics solely for this freeze. Existing Prometheus application metrics and future `self_healing_*` series ([`self-healing-metrics.md`](self-healing-metrics.md)) should remain low-cardinality.
