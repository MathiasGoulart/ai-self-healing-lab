# AI Self-Healing Lab

Open-source research project investigating **AI-driven self-healing in backend applications**.

This repository is a **scientific instrument**, not a product. It compares two approaches under controlled conditions:

1. **Embedded AI** — AI capabilities integrated directly into the backend application.
2. **External AI Agent** — the backend remains AI-free; an external agent observes telemetry and detects anomalies.

> **AI and autonomous self-healing are intentionally NOT part of Phase 1.**

---

## Repository layout

| Path | Purpose |
|------|---------|
| `application/order-service/` | Phase 1 experimental subject (NestJS Order Processing Service) |
| `embedded-ai/` | Phase 3 — embedded AI approach (placeholder) |
| `external-agent/` | Phase 4 — external AI agent approach (placeholder) |
| `fault-injector/` | Phase 2 — fault injection tooling (placeholder) |
| `infrastructure/` | Phase 2+ — Kubernetes/k3s and shared infra (placeholder) |
| `experiments/` | Phase 5 — experiment definitions and run artifacts (placeholder) |
| `analysis/` | Phase 6 — statistical analysis (placeholder) |
| `research/` | Research questions, methodology, and experiment protocol |
| `docs/` | Cross-cutting project documentation |

---

## Phase 1 — Experimental backend

The Order Processing Service:

```bash
cd application/order-service
docker compose up --build
```

See [`application/order-service/README.md`](application/order-service/README.md).

## Phase 1.5 — k3s + research metrics

Deploy the same application to the home k3s cluster and scrape Prometheus-compatible research metrics:

```bash
# See full steps (build images, import to k3s, apply manifests)
cat infrastructure/k3s/README.md
```

Telemetry model: [`docs/observability.md`](docs/observability.md).

---

## Research documentation

- [`research/research-questions.md`](research/research-questions.md)
- [`research/methodology.md`](research/methodology.md)
- [`research/experiment-protocol.md`](research/experiment-protocol.md)
- [`docs/architecture.md`](docs/architecture.md)

---

## Future experimental phases

* **Phase 1.5** — k3s deployment and research metrics baseline *(current)*
* **Phase 2** — Fault injection
* **Phase 3** — Embedded AI
* **Phase 4** — External AI Agent
* **Phase 5** — Controlled comparative experiments
* **Phase 6** — Statistical analysis

---

## License

Apache License 2.0. See [LICENSE](LICENSE).
