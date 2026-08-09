# Experiment Protocol

This document will define the **controlled comparative experiment protocol** used in Phases 5–6.

Phase 1 does not run comparative AI experiments. It only establishes the subject system.

## Planned protocol outline

### 1. Preconditions

- order-service, PostgreSQL, and payment-service are healthy
- Fault injector configured for the scenario under test
- Telemetry endpoints reachable (metrics, logs, traces)
- Approach under test selected: embedded AI **or** external agent (not both in the same run, unless studying interaction as a separate factor)

### 2. Baseline

1. Seed deterministic data
2. Apply steady workload with **no** injected faults
3. Record baseline metrics for a fixed window

### 3. Fault injection

1. Enable a single fault scenario (e.g., payment latency)
2. Continue the same workload
3. Record timestamps for fault start / stop

### 4. Observation

Collect for each run:

- Detection events (if any)
- Localization statements
- Recovery actions / suggestions
- System metrics and traces

### 5. Cleanup and reset

Return the environment to a known-good state before the next scenario.

### 6. Analysis

Aggregate runs per scenario and approach; compute outcome measures defined in `methodology.md`.

---

## Status

Protocol details (exact workloads, scenario catalog, sample sizes, and statistical tests) will be filled in when Phases 2–5 are implemented.
