# Architectural Comparison

**Document type:** Research architecture / expected trade-offs  
**Status:** Conceptual — **not experimental results**

This document contrasts the two levels of the independent variable **AI architectural placement**. Statements below are **hypotheses / expected trade-offs**, not findings.

---

## Architecture A — Embedded AI

```text
┌──────────────────────────────┐
│       Backend Application    │
│                              │
│  Business Logic              │
│  Observability               │
│  AI Self-Healing             │
│                              │
│  Monitor → Analyze           │
│       → Plan → Execute       │
└──────────────────────────────┘
```

The MAPE-K loop is co-located with business logic and can access application-local context.

---

## Architecture B — External AI Agent

```text
┌─────────────────┐
│ Backend         │
│ Application     │
└────────┬────────┘
         │ telemetry
         ▼
┌─────────────────────────────┐
│ External AI Agent           │
│                             │
│ Monitor → Analyze           │
│      → Plan → Execute       │
└─────────────────────────────┘
```

The application remains AI-free for the comparative External condition. The agent reasons over exported telemetry and acts through external control paths.

---

## Expected trade-offs (hypotheses)

### Embedded

```text
+ local context
+ potentially lower detection/action latency
− application resource overhead
− tighter coupling
```

### External

```text
+ separation of concerns
+ independent scaling
+ less application overhead
− telemetry dependency
− observation/action latency
− potentially less application-local context
```

These motivate hypotheses H1–H4 ([`../research/hypotheses.md`](../research/hypotheses.md)). Empirical outcomes may reverse or nullify any of them.

---

## What is held constant in comparison

Paired experiments use the same:

- Workload (k6)
- Fault type, severity, and duration
- Infrastructure and resource limits
- Application / payment / database versions (immutable tags)

Only **placement** changes. See [`../research/experimental-protocol.md`](../research/experimental-protocol.md).

---

## Observation paths

| Path | Role |
|------|------|
| k6 | Client experience under load |
| Prometheus (+ logs/traces) | System behavior; primary input to the external agent |

Application metrics are retained in both conditions.
