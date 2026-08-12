# E001 results — Payment Latency (Medium)

| Field | Value |
|-------|-------|
| **Status** | **EXECUTED** |
| **Classification** | VALID (controlled load-generator conditions) |
| **Date (UTC)** | 2026-08-11 |
| **Self-healing** | None |
| **Images** | order-service `sha-fd43433`, payment-service `sha-4099043` |

Canonical protocol: [`../../../research/protocol-freeze.md`](../../../research/protocol-freeze.md)

## Timeline

| Event | UTC | Symbol |
|-------|-----|--------|
| Start | 2026-08-11T22:11:47Z | E001_START |
| F01 activated (medium / +2000 ms) | 2026-08-11T22:14:47Z | **T0** |
| Degradation detected (2-of-3) | 2026-08-11T22:15:47Z | **T1** |
| F01 deactivated (manual) | 2026-08-11T22:17:47Z | — |
| Recovery confirmed (2-of-3) | 2026-08-11T22:18:47Z | **T3** |
| End | 2026-08-11T22:21:48Z | E001_END |

```text
T2 = N/A — no self-healing action

TTD = T1 − T0 = 60 s
TTR = T3 − T0 = 240 s   (observed recovery after manual deactivation; not self-healing)
```

Degradation transition trio p95 (ms): `87.5`, `2425.0`, `2425.0`  
Recovery transition trio p95 (ms): `2425.0`, `75.0`, `80.625`

Final evaluated state: **HEALTHY**

## Primary SLI (authoritative)

Prometheus `order_processing_duration_seconds` p95, 30 s windows, rolling 2-of-3 vs 500 ms threshold.

Artifacts: `prometheus_windows.json`, `evaluation.json`, `timeline.json`

## Client measurements (k6 — descriptive)

| Metric | Value |
|--------|------:|
| Iterations | 6001 (≈ 10.00 / s) |
| Checks | 100% (0 fails) |
| HTTP req duration p95 | ≈ 2081 ms |
| Order flow duration p95 | ≈ 2203 ms |

k6 values mix baseline + fault + recovery phases; they are **not** the authoritative degradation state.

## Load-generator conditions

| Field | Value |
|-------|-------|
| power_source | AC |
| lowpowermode | 0 |
| sleep_prevention | caffeinate |

## Artifacts

| File | Role |
|------|------|
| `summary.json` / `report.html` | k6 summary |
| `timeline.json` | T0 / annotations / images |
| `evaluation.json` | T1 / T3 / TTD / TTR |
| `prometheus_windows.json` | Primary SLI window series |
| `control.log` | Operator control log |
| `fault_*_response.json` | FaultController API responses |
| `classification.json` | Run classification |

Runner: [`../../run-e001.sh`](../../run-e001.sh)
