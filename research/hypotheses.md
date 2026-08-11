# Hypotheses

**Document type:** Research hypotheses  
**Status:** Initial — subject to empirical rejection

These statements guide experiment design. They are **not** conclusions. Results may support, partially support, or reject any hypothesis.

---

## H1 — Detection latency

> Embedded AI will have lower fault detection latency than an external AI agent because it can access application-local state and telemetry with fewer communication and observation delays.

| | |
|--|--|
| **Related RQ** | RQ1 |
| **Primary metric** | TTD |
| **Falsified if** | External TTD is lower, or no significant difference under the controlled protocol |

---

## H2 — Diagnosis accuracy

> Embedded AI will achieve higher fault diagnosis accuracy for application-specific faults because it can access internal application context unavailable to an external agent.

| | |
|--|--|
| **Related RQ** | RQ2 |
| **Primary metrics** | Root Cause Accuracy; FPR; FNR |
| **Falsified if** | External diagnosis is more accurate, or no significant difference |

---

## H3 — Recovery latency

> Embedded AI will achieve lower recovery latency for faults that can be remediated using application-local actions.

| | |
|--|--|
| **Related RQ** | RQ3 |
| **Primary metric** | TTR (and Recovery Success Rate as a companion outcome) |
| **Falsified if** | External TTR is lower (when both recover successfully), or no significant difference |
| **Scope note** | Applies to remediations that are feasible locally; remote-only remediations may favor either architecture |

---

## H4 — Runtime overhead

> Embedded AI will introduce greater runtime resource overhead than an external AI agent because inference and decision-making execute within the application environment.

| | |
|--|--|
| **Related RQ** | RQ4 |
| **Primary measures** | CPU; Memory; HTTP latency impact; Throughput impact |
| **Falsified if** | Embedded overhead is not greater, or no significant difference |

---

## H5 — Fault severity

> Increasing fault severity will affect both approaches, but the relative difference between embedded and external AI may vary according to fault type and severity.

| | |
|--|--|
| **Related RQ** | RQ5 |
| **Nature** | Interaction hypothesis (placement × severity × fault type) |
| **Falsified if** | Relative effectiveness is invariant across severities (within measurement error), contrary to the predicted interaction pattern for the studied faults |

---

## Methodological stance

| Claim type | Meaning in this repo |
|------------|----------------------|
| **Research hypothesis** | Testable prediction (this file) |
| **Experimental protocol** | How we will test it |
| **Observed result** | Empirical outcome after runs + analysis |
| **Established from literature** | Cited prior work — not claimed as our result |

Trade-offs listed in [`../docs/architectural-comparison.md`](../docs/architectural-comparison.md) are **expected trade-offs / hypotheses**, not findings.
