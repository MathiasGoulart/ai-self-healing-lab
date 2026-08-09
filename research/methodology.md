# Methodology

## Overview

The research compares two AI placements against the same experimental backend and the same injected faults:

| Approach | Description |
|----------|-------------|
| Embedded AI | AI capabilities integrated into the order-service process or its immediate runtime |
| External AI Agent | order-service remains AI-free; an external agent consumes telemetry and reasons about anomalies |

A common experimental subject (`application/order-service`) and shared fault scenarios keep the comparison controlled.

## Experimental subject

The Phase 1 Order Processing Service provides:

- Two primary flows: create order, process order
- A mock payment dependency designed for later fault injection
- Metrics, structured logs, and OpenTelemetry traces

No AI or self-healing logic is present in Phase 1.

## Controlled variables (planned)

- Workload (request rate, mix of create/process)
- Fault type and intensity (latency, error, timeout, intermittent)
- Observation window and telemetry configuration
- Recovery policy / agent configuration (Phases 3–4)

## Outcome measures (planned)

- Detection time
- Detection precision / recall
- Localization correctness
- Recovery success rate (where autonomous action is in scope)
- Resource overhead (CPU, memory, extra network)
- Operational complexity (qualitative)

## Phased delivery

1. **Phase 1** — Build the observable experimental subject
2. **Phase 2** — Deploy on Kubernetes/k3s; add fault injection
3. **Phase 3** — Embedded AI
4. **Phase 4** — External AI Agent
5. **Phase 5** — Controlled comparative experiments
6. **Phase 6** — Statistical analysis

## Reproducibility

Experiments must be runnable from documented commands, with deterministic seed data where applicable, fixed schemas, and versioned configuration. Detailed run steps will live under `experiments/` and `research/experiment-protocol.md` as later phases land.
