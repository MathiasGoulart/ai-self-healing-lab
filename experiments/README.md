# Experiments

Experiment definitions and (later) run artifacts for controlled studies.

| ID | Name | Status |
|----|------|--------|
| [E000](../load-testing/experiments/E000/) | Baseline (no fault) | Exploratory + controlled repeats; primary = R6–R8 |
| [E001](./E001/) | Payment Latency — Medium (F01) | **EXECUTED** — fault characterization ([results](../load-testing/experiments/E001/RESULTS.md)) |
| E002 | Embedded AI + R01 (`timeout_ms = 300`) | **Parameters frozen** — not executed ([R01](../research/remediation-r01.md)) |
| E003 | External Agent + R01 (`timeout_ms = 300`) | **Parameters frozen** — not executed (paired with E002) |
| E004 | R01-adaptive (AI chooses timeout) | Planned — decision quality |
| E005 | R01b fallback / full recovery | Planned — capability shedding (separate study) |

Protocol: [`../research/experimental-protocol.md`](../research/experimental-protocol.md) · Freeze: [`../research/protocol-freeze.md`](../research/protocol-freeze.md) · Remediation: [`../research/remediation-r01.md`](../research/remediation-r01.md)
