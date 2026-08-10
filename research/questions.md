# Research Questions

**Document type:** Research protocol (questions under study)  
**Status:** Defined for experimentation — not yet answered

---

## Research framing

This project is an **experimental evaluation of the effect of AI architectural placement on self-healing effectiveness in backend applications.**

It is **not** limited to “which AI detects anomalies better.” The unit of evaluation is the complete self-healing loop in the MAPE-K tradition:

```text
Monitor → Analyze → Plan → Execute
```

(with Knowledge as shared context across steps).

The comparison is between two architectural placements of that loop:

| Level | Name | Placement |
|-------|------|-----------|
| A | **Embedded AI** | Monitor / Analyze / Plan / Execute live **inside** the backend application |
| B | **External AI Agent** | The application remains AI-free and exposes telemetry; an **external** agent performs Monitor / Analyze / Plan / Execute |

---

## Independent variable

**AI architectural placement**, with two levels:

1. Embedded
2. External

All other experimental factors are controlled (see [`experimental-protocol.md`](experimental-protocol.md)).

---

## RQ1 — Detection

> How does the architectural placement of an AI-based self-healing mechanism affect fault detection latency in a backend application?

| | |
|--|--|
| **Primary metric** | Time to Detection (TTD) |
| **Definition** | [`metrics.md`](metrics.md#time-to-detection--ttd) |

---

## RQ2 — Diagnosis

> How does the architectural placement of an AI-based self-healing mechanism affect fault diagnosis accuracy?

| | |
|--|--|
| **Primary metrics** | Root Cause Accuracy; False Positive Rate; False Negative Rate |
| **Requirement** | Diagnosis must identify the **fault class / component**, not merely that an anomaly exists |

---

## RQ3 — Recovery

> How does the architectural placement of an AI-based self-healing mechanism affect recovery time and recovery success?

| | |
|--|--|
| **Primary metrics** | Time to Recovery (TTR); Recovery Success Rate |
| **Definitions** | [`metrics.md`](metrics.md); recovery success per [`recovery-criteria.md`](recovery-criteria.md) |

Issuing an action is **not** recovery. Recovery requires satisfying predefined healthy-state criteria.

---

## RQ4 — Runtime Overhead

> What runtime overhead is introduced by embedded versus external AI-based self-healing mechanisms?

| | |
|--|--|
| **Measures** | CPU overhead; Memory overhead; HTTP latency impact; Throughput impact |

Embedded placement must **not** be judged superior on detection/recovery alone if it imposes substantially greater application overhead.

---

## RQ5 — Fault Severity

> How does fault severity affect the relative effectiveness of embedded and external AI-based self-healing mechanisms?

Faults are evaluated at multiple intensities (e.g. low / medium / high). Severity levels are protocol inputs; they are **not implemented** in this documentation phase.

---

## Falsifiability

For each RQ, acceptable empirical conclusions include:

- Embedded > External
- External > Embedded
- No statistically significant difference

The protocol must not assume that Embedded AI is superior.

---

## Related documents

- Hypotheses: [`hypotheses.md`](hypotheses.md)
- Metrics: [`metrics.md`](metrics.md)
- Protocol: [`experimental-protocol.md`](experimental-protocol.md)
- Fault matrix: [`fault-matrix.md`](fault-matrix.md)
- Architecture: [`../docs/architecture.md`](../docs/architecture.md)
- Architectural comparison: [`../docs/architectural-comparison.md`](../docs/architectural-comparison.md)
