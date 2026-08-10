# AI Self-Healing Lab

Open-source research project: an **experimental evaluation of the effect of AI architectural placement on self-healing effectiveness in backend applications**.

This repository is a **scientific instrument**, not a product. Under controlled faults and identical workload, it compares two MAPE-K placements:

1. **Embedded AI** — Monitor → Analyze → Plan → Execute integrated into the backend application.
2. **External AI Agent** — the backend remains AI-free; an external agent observes telemetry and performs the self-healing loop.

The unit of evaluation is the **complete self-healing loop**, not anomaly detection alone.

> **AI, fault injection, and autonomous recovery are intentionally NOT implemented yet.**

---

## Repository layout

| Path | Purpose |
|------|---------|
| `application/order-service/` | Experimental subject (NestJS Order Processing Service) |
| `load-testing/` | k6 experimental load-testing harness |
| `embedded-ai/` | Embedded AI approach (placeholder) |
| `external-agent/` | External AI agent approach (placeholder) |
| `fault-injector/` | Fault injection tooling (placeholder) |
| `infrastructure/` | k3s manifests, ServiceMonitors, and shared infra |
| `experiments/` | Experiment run artifacts (placeholder) |
| `analysis/` | Statistical analysis (placeholder) |
| `research/` | Research questions, hypotheses, metrics, and protocol |
| `docs/` | Architecture and observability documentation |

---

## Phase 1 — Experimental backend

```bash
cd application/order-service
docker compose up --build
```

See [`application/order-service/README.md`](application/order-service/README.md).

## Phase 1.5 — k3s + research metrics

```bash
cat infrastructure/k3s/README.md
```

Telemetry model: [`docs/observability.md`](docs/observability.md).

## Phase 1.6 — k6 load-testing harness

```bash
cat load-testing/README.md
./load-testing/run-e000.sh   # exploratory E000 baseline (requires reachable Order Service)
```

---

## Research documentation

| Document | Contents |
|----------|----------|
| [`research/questions.md`](research/questions.md) | RQ1–RQ5 |
| [`research/hypotheses.md`](research/hypotheses.md) | H1–H5 (falsifiable) |
| [`research/metrics.md`](research/metrics.md) | TTD, TTR, dependent variables |
| [`research/experimental-protocol.md`](research/experimental-protocol.md) | Controls, baseline repeats, paired design |
| [`research/recovery-criteria.md`](research/recovery-criteria.md) | Recovery framework (thresholds from baseline) |
| [`research/fault-matrix.md`](research/fault-matrix.md) | Candidate faults F01–F06 |
| [`research/self-healing-metrics.md`](research/self-healing-metrics.md) | Future self-healing Prometheus metrics |
| [`research/methodology.md`](research/methodology.md) | Methodology overview |
| [`docs/architecture.md`](docs/architecture.md) | System context + MAPE-K mapping |
| [`docs/architectural-comparison.md`](docs/architectural-comparison.md) | Embedded vs External trade-offs |

---

## Future experimental phases

* **Baseline repeats** — E000-R1…R5; derive recovery envelopes
* **Phase 2** — Fault injection
* **Phase 3** — Embedded AI
* **Phase 4** — External AI Agent
* **Phase 5** — Controlled comparative experiments
* **Phase 6** — Statistical analysis

---

## License

Apache License 2.0. See [LICENSE](LICENSE).
