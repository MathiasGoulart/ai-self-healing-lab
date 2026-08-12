# R01 Parameter Characterization (Analysis Only)

**Document type:** Empirical parameterization analysis  
**Status:** Analysis complete — **does not modify** the frozen experimental protocol  
**Date:** 2026-08-12  
**Scope:** E000-R6 / R7 / R8 controlled baseline only (plus E001 F01 sanity cross-check)

```text
No protocol changes were made.
No E002/E003 execution occurred.
No F01 activation occurred.
No R01 actuator implementation occurred.
```

Related design: [`remediation-r01.md`](remediation-r01.md) · Dual-outcome recovery: [`protocol-freeze.md`](protocol-freeze.md) §4.1

Companion machine-readable extract: [`r01-parameter-characterization-raw.json`](r01-parameter-characterization-raw.json)

---

## 1. Sources and method

### 1.1 What exists on disk for R6–R8

| Artifact | Path | Contains `payment_request_duration`? |
|----------|------|--------------------------------------|
| k6 summary | `load-testing/experiments/E000-R{6,7,8}/summary.json` | **No** (client HTTP / order-flow only) |
| k6 HTML | `.../report.html` | **No** |
| classification | `.../classification.json` | N/A |
| Archived Prometheus for R6–R8 | — | **Not present** in the repo |

Authoritative dependency latency for R01 is Prometheus:

```text
payment_request_duration_seconds{job="order-service"}
```

(client-side payment call histogram on the Order Service).

### 1.2 How percentiles were obtained

Prometheus on cluster `rooteny-kubernetes` still retains the R6–R8 window (`storageRetention: 90d or 70GiB`). For each run, at the run end timestamp from `summary.json`:

```promql
histogram_quantile(
  q,
  sum by (le) (
    increase(payment_request_duration_seconds_bucket{job="order-service"}[<run_duration>s])
  )
)
```

with `q ∈ {0.50, 0.95, 0.99}`, evaluated at `time = run_end`.

Run windows (from `summary.json` `timestamp_utc` → `generated_at_utc`):

| Run | Start (UTC) | End (UTC) | Duration |
|-----|-------------|-----------|----------|
| E000-R6 | 2026-08-11T20:22:33.775Z | 2026-08-11T20:32:33.826Z | ≈ 600 s |
| E000-R7 | 2026-08-11T20:32:53.972Z | 2026-08-11T20:42:54.084Z | ≈ 600 s |
| E000-R8 | 2026-08-11T20:43:14.283Z | 2026-08-11T20:53:14.401Z | ≈ 600 s |

### 1.3 Pooled distribution (not average of p99s)

Pooled quantiles use a **single** `increase(...[1840s])` spanning R6 start → R8 end (includes ~15 s idle gaps between runs; idle contributes ≈ 0 observations):

```text
pooled window = 2026-08-11T20:22:33Z → 2026-08-11T20:53:14Z  (1840 s)
```

This is a proper pooled histogram over all observations in that span — **not** the mean of the three per-run p99 values.

### 1.4 Limitation — “max”

Prometheus histograms do **not** expose a true sample maximum.  
Reported **max** below is the **upper bound of the highest finite bucket that received observations** during the window (proxy). Occasional multi-second tails were already noted qualitatively in E000 documentation.

Histogram buckets (seconds): `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`.

---

## 2. Payment latency — controlled baseline

Values in **milliseconds** (Prometheus seconds × 1000). Counts rounded to nearest integer from `increase(..._count)`.

### 2.1 Per-run

| Run | p50 (ms) | p95 (ms) | p99 (ms) | max proxy (ms) | count |
|-----|---------:|---------:|---------:|---------------:|------:|
| R6 | 8.4 | 42.2 | 175.0 | 5000 | 6000 |
| R7 | 8.4 | 39.6 | 98.5 | 5000 | 5998 |
| R8 | 8.3 | 43.9 | 187.8 | 5000 | 6001 |

Notes:

- Body of the distribution is very fast (p50 ≈ 8 ms, p95 ≈ 40–44 ms).
- Healthy p99 is **two-digit to low three-digit ms**, not near 300 ms.
- A **small** number of observations land above 500 ms (up to the 2.5–5 s buckets) — consistent with rare natural tail spikes, not steady-state latency.

### 2.2 Pooled (R6→R8)

| Aggregate | p50 (ms) | p95 (ms) | p99 (ms) | max proxy (ms) | count |
|-----------|---------:|---------:|---------:|---------------:|------:|
| **Pooled** | **8.4** | **41.9** | **164.2** | **5000** | **17994** |

Conservative secondary statistic (explicitly **not** used as the pooled p99):

```text
max(per-run p99) = max(175.0, 98.5, 187.8) = 187.8 ms
```

### 2.3 Representative healthy tail (for parameterization)

| Statistic | Value | Role |
|-----------|------:|------|
| **Healthy payment p99 (pooled)** | **164.2 ms** | Primary tail reference |
| Conservative per-run p99 max | 187.8 ms | Sensitivity check |
| Healthy payment max | **unknown (true)**; proxy **5000 ms** | Rare tail only — **not** a steady-state operating point |

---

## 3. Order-processing success — controlled baseline

### 3.1 Prometheus (`orders_processing_total`)

`result="failure"` series returned **no data** in these windows (treated as **0** failures).  
`increase(...result="success")` matched total processing count within scrape noise.

| Run | Attempts (Prom ≈) | Success | Failed | Success rate |
|-----|------------------:|--------:|-------:|-------------:|
| R6 | 6000 | 6000 | 0 | **100%** |
| R7 | 5998 | 5998 | 0 | **100%** |
| R8 | 6001 | 6001 | 0 | **100%** |

### 3.2 k6 cross-check (client)

| Run | `order_processing_success` count | process→PAID check fails | Success rate |
|-----|--------------------------------:|-------------------------:|-------------:|
| R6 | 6001 | 0 | **100%** |
| R7 | 6000 | 0 | **100%** |
| R8 | 6001 | 0 | **100%** |

Overall checks: 100% passes on all three runs (`fails = 0`).

### 3.3 Minimum observed healthy success rate

```text
minimum observed healthy success rate = 100%
```

This is **observed**, not assumed.

---

## 4. Recommended availability guardrail X

| Item | Value |
|------|------:|
| Observed healthy success rate (R6–R8) | **100%** |
| **Recommended X** | **99%** |

**Justification (data-bound, protocol not edited here):**

- Baseline never fell below 100% process success across ~18k attempts.
- At 10 orders/s and 30 s windows (~300 attempts/window), **99%** tolerates ≈ 3 failures/window; **95%** would tolerate ≈ 15 — too loose for a service that is empirically perfect in the controlled baseline.
- 99% leaves a small measurement/scrape margin without endorsing material availability loss as “successful recovery.”

Candidate already noted in protocol-freeze; this analysis **supports** freezing **99%** when the protocol is next amended. **No protocol file was changed in this task.**

---

## 5. Recommended R01 `timeout_ms` (fixed for E002/E003)

### 5.1 Constraints

```text
healthy payment tail  ≪  timeout_ms     (avoid material false timeouts when healthy)
timeout_ms            <  500 ms         (must be able to pull order-processing p95 under threshold)
timeout_ms            ≪  2000 ms        (must bound F01 medium)
```

### 5.2 Evaluation of 300 ms

| Check | Result |
|-------|--------|
| vs pooled p99 164.2 ms | 300 / 164.2 ≈ **1.83×** |
| vs conservative per-run p99 187.8 ms | 300 / 187.8 ≈ **1.60×** |
| vs 500 ms SLI threshold | **300 < 500** ✓ |
| vs F01 +2000 ms | **300 ≪ 2000** ✓ |

**False-timeout under healthy load (estimate from pooled buckets):**  
~28 observations in (250 ms, 500 ms] and ~4 above 500 ms out of ~17994. Approximating the (250,500] bucket as uniform, ≈ 0.15% of healthy payments would exceed 300 ms — well below a 1% availability budget (compatible with X = 99%).

**True max proxy (5000 ms) is not used to set timeout:** those events are rare natural spikes already accepted by the p95 + 2-of-3 health model; sizing timeout to the absolute max would push timeout toward/above 500 ms and defeat containment.

### 5.3 Recommendation

```text
Recommended R01 timeout_ms = 300
```

300 ms is **supported by the data**, not assumed a priori: it sits clearly above the healthy p99 band (164–188 ms), stays under the 500 ms latency threshold, and bounds F01 (+2000 ms).

Alternatives considered:

| Candidate | Verdict |
|-----------|---------|
| 250 ms | Closer to p99; more healthy false timeouts from the 250–500 ms bucket — weaker |
| 350–400 ms | Also viable; more healthy margin, still &lt; 500 ms — acceptable but less headroom under the SLI |
| 300 ms | **Preferred balance** |

E002/E003 must use this **fixed** value for both Embedded and External.

---

## 6. Recommended actuator safety bounds

Even with a fixed protocol timeout, the actuator must reject SLI-gaming values.

| Bound | Recommended | Derivation |
|-------|------------:|------------|
| **Tmin** | **200 ms** | Strictly above healthy payment p99 (pooled 164.2 ms; conservative per-run max 187.8 ms). Blocks `timeout_ms = 1` and other sub-tail values. |
| **Tmax** | **450 ms** | Strictly below the 500 ms latency degradation/recovery threshold, with a 50 ms margin so the timeout ceiling cannot sit on the SLI boundary. |

```text
Tmin = 200 ms  >  healthy payment p99
Tmax = 450 ms  <  500 ms
```

```text
200 ≤ timeout_ms ≤ 450
```

Fixed E002/E003 value **300** lies inside `[200, 450]`.  
AI **must not** choose `timeout_ms` in E002/E003 (that is E004 — R01-adaptive).

---

## 7. E001 cross-check (sanity only — not used to tune)

| Item | Value |
|------|------:|
| F01 medium injected latency | **+2000 ms** |
| Proposed R01 timeout | **300 ms** |
| Ratio | 2000 / 300 ≈ **6.7×** |

F01 remains far above the timeout: under fault, essentially all payment calls hit the timeout → expected **PERFORMANCE CONTAINMENT** (latency down, success down). E001 healthy order-processing windows (~50–90 ms p95) are consistent with payment p50/p95 being small; **E001 was not used to select 300 ms**.

---

## 8. Final recommendation

```text
Healthy payment p99: 164.2 ms   (pooled R6→R8)
Healthy payment max: unknown true max; histogram proxy 5000 ms (rare tail)
Healthy success rate: 100 %

Recommended availability guardrail X: 99 %

Recommended R01 timeout: 300 ms

Recommended Tmin: 200 ms
Recommended Tmax: 450 ms

Rationale:
  Pooled payment_request_duration p99 over E000-R6/R7/R8 is 164.2 ms
  (conservative max of per-run p99 = 187.8 ms). timeout_ms = 300 sits
  ~1.6–1.8× above that healthy p99, remains < 500 ms so containment can
  satisfy the latency SLI, and is ≪ F01 +2000 ms. Estimated healthy
  false-timeout rate at 300 ms is ≪ 1%, compatible with X = 99% given
  observed 100% baseline success. Tmin = 200 ms blocks sub-tail gaming;
  Tmax = 450 ms keeps the actuator ceiling below the 500 ms threshold.
```

```text
No protocol changes were made.
No E002/E003 execution occurred.
No F01 activation occurred.
```

---

## 9. Assumptions and limitations

1. **Retention:** Analysis depends on Prometheus still holding 2026-08-11 data (verified at query time). Repo-local R6–R8 artifacts alone are insufficient for payment percentiles.
2. **`increase()` scrape noise:** Counts are non-integral (~5998–6001); rounded for tables; negligible for rates.
3. **Inter-run gaps:** Pooled 1840 s window includes ~15 s pauses; they add essentially no payment samples.
4. **Max:** Histogram proxy ≠ true max; rare multi-second samples exist and are ignored for timeout sizing (by design).
5. **False-timeout estimate** inside (250,500] assumes uniformity within the bucket — approximate only.
6. **Protocol:** Recommendations are advisory until an explicit protocol amendment freezes X / `timeout_ms` / bounds.

---

## 10. Suggested next step (out of scope here)

When accepting these values, amend (in a **separate** change):

- [`remediation-r01.md`](remediation-r01.md) — publish `timeout_ms = 300`, `Tmin = 200`, `Tmax = 450`
- [`protocol-freeze.md`](protocol-freeze.md) — freeze availability guardrail **X = 99%**

Do **not** implement the actuator until that freeze is explicit.
