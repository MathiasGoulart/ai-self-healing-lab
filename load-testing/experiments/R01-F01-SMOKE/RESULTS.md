# R01 + F01 manual smoke (no AI)

| Field | Value |
|-------|-------|
| **Verdict** | **PASS** |
| **AI / E002** | None — not a formal experiment |
| **Environment** | Local `docker compose` (order-service rebuilt with R01 actuator) |
| **Timestamp (UTC)** | 2026-08-12T21:24:51Z |

## Sequence

1. Baseline — PAID in **75 ms**
2. F01 medium ON — PAID in **2065 ms**
3. R01 `timeout_ms=300` ON **while F01 still active**
4. Coexistence: `fault_injection_active=1` ∧ `remediation_active=1`
5. F01+R01 process — HTTP **502**, **377 ms**, `remediation=payment_timeout`, `payment_timeouts_total` 0→1
6. F01 still **active** after containment (R01 does not clear fault)
7. Clear R01 + F01 — recover PAID in **48 ms**

## Artifacts

`summary.json`, `smoke.log`, activate/clear JSON, metric snippets in this directory.

## Note

k3s still pins order-service `sha-fd43433` (pre-R01). This smoke used local compose rebuild, not the cluster image. Cluster smoke requires publishing/pinning an order-service image that includes the actuator.
