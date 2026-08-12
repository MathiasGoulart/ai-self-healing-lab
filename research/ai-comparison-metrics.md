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

### TTR — Time To Recovery

```text
TTR = recovery confirmation time (T3) − fault activation time (T0)
```

T3 requires the frozen 2-of-3 recovery rule (not merely issuing an action).

### Action Correctness

Was the recovery action appropriate and successful relative to the fault and recovery criteria?

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
