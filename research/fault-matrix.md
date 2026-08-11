# Fault Matrix

**Document type:** Experimental protocol (candidate fault catalog)  
**Status:** Initial candidates — **not implemented**

This matrix lists fault classes under consideration. The final set may be reduced after literature review and feasibility assessment. **Do not assume every fault will be implemented.**

---

## Candidate faults

| ID  | Fault                    | Layer      | Example severity |
| --- | ------------------------ | ---------- | ---------------- |
| F01 | Payment latency          | Dependency | low / medium / high |
| F02 | Payment errors           | Dependency | low / medium / high |
| F03 | Payment unavailable      | Dependency | low / medium / high |
| F04 | DB connection exhaustion | Database   | low / medium / high |
| F05 | CPU saturation           | Runtime    | low / medium / high |
| F06 | Memory pressure          | Runtime    | low / medium / high |

Severity levels are protocol factors for RQ5. Concrete parameterizations (e.g. `+2s` latency for F01/medium) are defined when a fault is implemented.

---

## Injection record requirements

Every injection must include:

| Field | Example |
|-------|---------|
| Experiment ID | `E001` |
| Fault ID | `F01` |
| Severity | `medium` |
| Start timestamp (UTC) | ISO-8601 |
| End timestamp (UTC) | ISO-8601 |
| Target component | `payment-service` |
| Fault parameters | `+2s latency` |

Example:

```text
Experiment: E001
Fault: F01
Target: payment-service
Severity: medium
Parameter: +2s latency
Start: timestamp
End: timestamp
```

Without precise start/end timestamps, TTD and TTR cannot be computed ([`metrics.md`](metrics.md)).

---

## Paired comparison rule

For a given fault ID + severity + duration:

1. Run Embedded repetitions  
2. Run External repetitions  
3. Hold workload, application versions, and infrastructure constant  

See [`experimental-protocol.md`](experimental-protocol.md).

---

## Out of scope for this document

- Implementing injectors or hooks  
- Choosing final severity numeric parameters  
- Claiming which faults are “most important” without evidence  
