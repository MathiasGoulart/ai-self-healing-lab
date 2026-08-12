# E000 baseline repetitions (R1–R8)

| Field | Value |
|-------|-------|
| Family | E000 |
| Condition | No fault |
| Workload | create → process |
| Rate | 10 iterations/second |
| Duration | 10 minutes per repetition |
| Images | order-service `sha-fd43433`, payment-service `sha-4099043` |

## Classification

| Runs | Interpretation |
|------|----------------|
| **R1 / R2** | Original-condition observations |
| **R3 / R4 / R5** | Potentially confounded by load-generator power-saving |
| **R6 / R7 / R8** | **Primary controlled baseline dataset** |

| Run | Classification | Notes |
|-----|----------------|-------|
| E000-R1 | **VALID** | Original-condition observation |
| E000-R2 | **VALID** | Original-condition observation |
| E000-R3 | **POTENTIALLY CONFOUNDED** | Load-generator host entered macOS power-saving mode |
| E000-R4 | **POTENTIALLY CONFOUNDED** | Load-generator host entered macOS power-saving mode |
| E000-R5 | **POTENTIALLY CONFOUNDED** | Power-saving affected approximately 75% of the run |
| E000-R6 | **CONTROLLED** | AC + `caffeinate`; primary controlled baseline |
| E000-R7 | **CONTROLLED** | AC + `caffeinate`; primary controlled baseline |
| E000-R8 | **CONTROLLED** | AC + `caffeinate`; primary controlled baseline |

Wording for R3–R5:

> The R3–R5 repetitions were potentially confounded by load-generator power-saving. Controlled repetitions R6–R8 were subsequently executed under AC power with Low Power Mode disabled and sleep prevention enabled.

This does **not** claim that power-saving definitively caused the latency increase.

R1–R5 `summary.json` / `report.html` were **preserved unchanged**. Status is recorded in each run’s `classification.json`.

### Controlled baseline sample (R6–R8 flow p95)

| Run | Flow p95 (approx.) |
|-----|-------------------:|
| R6 | ≈ 300.3 ms |
| R7 | ≈ 288.5 ms |
| R8 | ≈ 306.5 ms |

Descriptive sample only — no final statistical envelope is defined here. Authoritative experimental degradation uses **Prometheus order-processing p95** ([`../../research/protocol-freeze.md`](../../research/protocol-freeze.md)).

## Comparison table (client / k6)

| Run | Power state | Flow p95 (ms) | HTTP p95 (ms) | Iterations/s | Errors | Classification |
| --- | ------------------ | -------: | -------: | -----------: | -----: | ---------------------- |
| R1 | controlled/unknown | 266 | 146.2 | 10.0010 | 0% | VALID |
| R2 | controlled/unknown | 248 | 133.6 | 9.9999 | 0% | VALID |
| R3 | power saving | 328 | 178.5 | 9.9829 | 0% | POTENTIALLY CONFOUNDED |
| R4 | power saving | 321 | 175.9 | 10.0003 | 0% | POTENTIALLY CONFOUNDED |
| R5 | power saving ~75% | 322 | 178.7 | 9.9984 | 0% | POTENTIALLY CONFOUNDED |
| R6 | controlled | 300 | 169.0 | 10.0010 | 0% | CONTROLLED |
| R7 | controlled | 289 | 164.2 | 9.9983 | 0% | CONTROLLED |
| R8 | controlled | 306 | 165.3 | 9.9999 | 0% | CONTROLLED |

Checks were 100% on all runs. No formal statistical envelope is computed here.

### Observational note (not a causal conclusion)

- R1/R2 flow p95 ≈ **248–266 ms**
- R3/R4/R5 flow p95 ≈ **321–328 ms**
- R6/R7/R8 flow p95 ≈ **289–306 ms** (between the two earlier bands)

R6–R8 do **not** clearly reproduce only the R1/R2 band or only the R3–R5 band. Further analysis is out of scope for this cleanup task.

## Load-generator conditions (R6–R8)

Verified programmatically at run start:

| Field | Value |
|-------|-------|
| platform | macOS |
| version | 26.6.1 |
| architecture | arm64 |
| cpu | Apple M4 |
| memory_gb | 32 |
| k6_version | v1.7.1 |
| power_source | **AC** (`pmset` “Now drawing from 'AC Power'”) |
| lowpowermode | **0** |
| sleep_prevention | **`caffeinate -dims`** wrapping the full R6–R8 series |

Not modified / not claimed:

- System `powernap` remained enabled in `pmset` defaults (not changed by the runner).
- Closing unnecessary background apps: **manual operator step** (not programmatically verified).

Same network path as R1–R5 (kubectl port-forward to k3s `svc/order-service`). F01 verified **OFF** before and after each of R6–R8.

## How to re-run controlled repetitions

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing port-forward svc/order-service 13000:3000

caffeinate -dims \
  env BASE_URL=http://127.0.0.1:13000 RATE=10 DURATION=10m \
      SLEEP_PREVENTION=caffeinate REPS="6 7 8" \
      ./load-testing/run-e000-repeats.sh
```

## Artifacts

| Run | Directory |
|-----|-----------|
| E000-R1 … R8 | `load-testing/experiments/E000-R{n}/` (`summary.json`, `report.html`, `classification.json`) |

## Explicit exclusions

```text
E001 formal experiment: EXECUTED (2026-08-11) — see ../E001/
Fault injection during R6–R8: NONE
Baseline envelope / anomaly thresholds: NOT DEFINED YET
```
