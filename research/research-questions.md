# Research Questions

This project investigates how AI can support self-healing behavior in backend applications under controlled fault conditions.

## Primary questions

1. **Detection** — How effectively can an AI-assisted system detect anomalies in a small, observable backend using metrics, logs, and traces?
2. **Localization** — How accurately can the system localize the fault to a component or dependency (for example, payment latency vs database errors)?
3. **Recovery suggestion / action** — Given a detected anomaly, how useful are AI-generated recovery actions or recommendations compared to a baseline without AI?
4. **Placement** — How do **embedded AI** (inside the application) and an **external AI agent** (outside the application) compare on detection latency, accuracy, overhead, and operational complexity?

## Secondary questions

- What telemetry signals are most informative for reliable detection in this domain?
- How does fault type (latency, errors, timeouts, intermittent failure) affect each approach?
- What are the false-positive and false-negative characteristics of each approach under identical workloads?

## Non-goals (especially Phase 1)

Phase 1 does **not** answer these questions. It only builds the experimental subject and baseline observability required to study them later.
