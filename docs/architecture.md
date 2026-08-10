# Architecture

**Document type:** Research architecture (conceptual)  
**Status:** Subject system implemented (Phases 1–1.6); AI / fault injection not implemented

This document describes the research instrument architecture and maps future self-healing approaches to **MAPE-K**.

---

## Research framing

The lab evaluates the effect of **AI architectural placement** on self-healing effectiveness:

| Architecture | Placement of Monitor → Analyze → Plan → Execute |
|--------------|--------------------------------------------------|
| **A — Embedded AI** | Inside the backend application |
| **B — External AI Agent** | Outside the application; consumes telemetry |

The comparison targets the **complete self-healing loop**, not anomaly detection alone.

Detailed trade-offs: [`architectural-comparison.md`](architectural-comparison.md).  
Protocol: [`../research/experimental-protocol.md`](../research/experimental-protocol.md).

---

## System context (research environment)

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
 │   (future)      │─────► │  + postgres     │──────►│ metrics/logs/   │
 └─────────────────┘       │  + payment      │       │ traces          │
                           └────────┬────────┘       └────────┬────────┘
                                    │                         │
                    ┌───────────────┴───────────────┐         │
                    │                               │         │
                    ▼                               ▼         ▼
           ┌─────────────────┐             ┌─────────────────┐
           │  embedded-ai    │             │ external-agent  │
           │   (future)      │             │   (future)      │
           └─────────────────┘             └─────────────────┘
                           ▲                         │
                           │                         │
                     k6 load-testing ────────────────┘
                     (client perspective)
```

---

## MAPE-K as conceptual framework

Self-adaptive systems literature commonly structures autonomy as:

```text
Monitor → Analyze → Plan → Execute
              ↑___________│
                   Knowledge
```

Both experimental architectures implement this loop; they differ in **where** the loop runs and what context it can observe.

### Embedded AI — MAPE-K mapping

```text
┌──────────────────────────────────────────┐
│            Backend Application           │
│                                          │
│   Monitor  →  Analyze  →  Plan  →  Execute
│        \__________________/              │
│              Knowledge                   │
└──────────────────────────────────────────┘
```

| MAPE-K element | Embedded role (conceptual) |
|----------------|----------------------------|
| Monitor | Local metrics, internal state, in-process signals |
| Analyze | Detect anomalies; diagnose fault class/component |
| Plan | Select remediation feasible in-app / via local actuators |
| Execute | Apply remediation (future; not implemented) |
| Knowledge | Policies, models, baselines, recent observations |

### External AI Agent — MAPE-K mapping

```text
┌─────────────────┐
│ Backend         │
│ Application     │──── telemetry (metrics / logs / traces)
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│           External AI Agent              │
│                                          │
│   Monitor  →  Analyze  →  Plan  →  Execute
│        \__________________/              │
│              Knowledge                   │
└──────────────────────────────────────────┘
```

| MAPE-K element | External role (conceptual) |
|----------------|----------------------------|
| Monitor | Observe exported telemetry (Prometheus, logs, traces) |
| Analyze | Detect anomalies; diagnose from external viewpoint |
| Plan | Select remediation via external actuators / APIs |
| Execute | Invoke remediations outside or against the app (future) |
| Knowledge | Policies, models, baselines, recent observations |

Exact implementation mechanisms may differ; MAPE-K remains the **comparison framework**.

---

## Current implementation scope

| Component | Status |
|-----------|--------|
| Order Service + Payment + PostgreSQL | Implemented |
| Prometheus metrics / logs / traces | Implemented |
| k3s deployment + GHCR images | Implemented |
| k6 load harness + E000 exploratory baseline | Implemented |
| Fault injector | Not implemented |
| Embedded AI | Not implemented |
| External AI Agent | Not implemented |

Design principles:

1. **Scientific instrument** — simplicity and determinism over product features.  
2. **Separation of concerns** — subject, AI approaches, infra, and analysis stay distinct.  
3. **Observability first** — telemetry remains available for the external agent.  
4. **Reproducibility** — immutable image tags, documented protocol, recorded experiment metadata.  
5. **Falsifiability** — protocol allows Embedded >, External >, or no significant difference.

Application details: [`../application/order-service/README.md`](../application/order-service/README.md).  
Telemetry model: [`observability.md`](observability.md).
