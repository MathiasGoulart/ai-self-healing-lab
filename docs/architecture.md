# Architecture

This document describes the **research project** architecture at a high level.

Phase 1 implements only the experimental subject (`application/order-service`). Later phases add fault injection, deployment, AI approaches, experiments, and analysis as separate components.

## System context (target)

```text
                    ┌─────────────────────────────────────┐
                    │         Research environment         │
                    │  (infra / experiments / analysis)    │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
 ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 │  fault-injector │       │ order-service   │       │ observability   │
 │   (Phase 2+)    │─────► │  (Phase 1)      │──────►│ metrics/logs/   │
 └─────────────────┘       │  + postgres     │       │ traces          │
                           │  + payment mock │       └────────┬────────┘
                           └────────┬────────┘                │
                                    │                         │
                    ┌───────────────┴───────────────┐         │
                    │                               │         │
                    ▼                               ▼         ▼
           ┌─────────────────┐             ┌─────────────────┐
           │  embedded-ai    │             │ external-agent  │
           │   (Phase 3)     │             │   (Phase 4)     │
           └─────────────────┘             └─────────────────┘
```

## Phase 1 component

The Order Processing Service is intentionally small:

- NestJS + TypeScript + PostgreSQL
- Mock Payment Service with future fault-injection hooks (no-ops in Phase 1)
- Prometheus metrics, structured JSON logs, OpenTelemetry traces

Application-level details live in [`application/order-service/README.md`](../application/order-service/README.md).

## Design principles

1. **Scientific instrument** — prefer simplicity and determinism over product features.
2. **Separation of concerns** — experimental subject, AI approaches, infra, and analysis stay in distinct directories.
3. **Observability first** — Phase 1 must emit enough telemetry for later comparative study.
4. **Reproducibility** — seed data, fixed schemas, and documented protocols.
