# Methodology

**Document type:** Research methodology overview  
**Canonical detail:** see the linked protocol documents below

---

## Framing

This project is an experimental evaluation of the effect of **AI architectural placement** on **self-healing effectiveness** in backend applications.

It compares two MAPE-K placements under controlled faults and identical workload:

| Approach | Description |
|----------|-------------|
| **Embedded AI** | Monitor → Analyze → Plan → Execute inside the application |
| **External AI Agent** | Application stays AI-free; external agent performs the loop over telemetry |

The evaluation covers the **full loop** (detection, diagnosis, recovery, overhead), not anomaly detection alone.

---

## Document map

| Topic | Document |
|-------|----------|
| **Protocol freeze (E001+)** | [`protocol-freeze.md`](protocol-freeze.md) |
| Research questions | [`questions.md`](questions.md) |
| Hypotheses | [`hypotheses.md`](hypotheses.md) |
| Metric definitions (TTD, TTR, …) | [`metrics.md`](metrics.md) |
| Experimental protocol & baseline repeats | [`experimental-protocol.md`](experimental-protocol.md) |
| Recovery / health state machine | [`recovery-criteria.md`](recovery-criteria.md) |
| AI comparison metrics | [`ai-comparison-metrics.md`](ai-comparison-metrics.md) |
| Candidate fault matrix | [`fault-matrix.md`](fault-matrix.md) |
| Future self-healing metrics | [`self-healing-metrics.md`](self-healing-metrics.md) |
| MAPE-K architecture | [`../docs/architecture.md`](../docs/architecture.md) |
| Architectural comparison | [`../docs/architectural-comparison.md`](../docs/architectural-comparison.md) |

---

## Experimental subject (implemented)

`application/order-service` provides:

- Business flows: create order → process order  
- Mock payment dependency (hooks reserved for future injection)  
- Metrics, structured logs, OpenTelemetry traces  
- k3s deployment + k6 harness  

No AI or self-healing logic is present yet.

---

## Phased delivery

1. **Phase 1 / 1.5 / 1.6** — Observable subject, k3s, metrics, k6 (+ exploratory E000)  
2. **Baseline repeats** — E000-R1…R5; derive recovery envelopes  
3. **Phase 2** — Fault injection with precise timestamps  
4. **Phase 3** — Embedded AI (MAPE-K)  
5. **Phase 4** — External AI Agent (MAPE-K)  
6. **Phase 5** — Controlled comparative experiments  
7. **Phase 6** — Statistical analysis  

---

## Reproducibility

- Immutable image tags (`sha-*` / digests) in every experiment artifact  
- Fixed k6 configuration within an experiment family  
- Recorded fault start/end timestamps  
- Documented recovery criteria derived from baseline  

Analysis must allow Embedded >, External >, or no statistically significant difference for each RQ.
