# Fault Injector (Phase 2A)

Deterministic experimental fault injection for the Payment Service.

## Principle

The injector is an **experimental instrument**. It does not detect anomalies or recover the system. It only applies the fault the experiment requested.

```text
Experiment → POST/DELETE /faults → Payment Service fault state → payment handler
```

## Implemented faults

| ID | Fault | API name | Severities |
|----|-------|----------|------------|
| F01 | Payment latency | `payment_latency` | `low`=500ms, `medium`=2000ms, `high`=5000ms |

F02+ are not implemented yet. The control API and `FaultController` are structured so new fault types can be added later.

## Control API (cluster-internal)

Payment Service ClusterIP only — **no public Ingress**.

```bash
# Inspect
curl http://payment-service:3001/faults

# Activate F01 medium
curl -X POST http://payment-service:3001/faults \
  -H 'Content-Type: application/json' \
  -d '{"fault":"payment_latency","severity":"medium"}'

# Deactivate
curl -X DELETE http://payment-service:3001/faults/payment_latency
```

From a developer machine (port-forward):

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing \
  port-forward svc/payment-service 3001:3001
```

### Idempotency

| Situation | Behavior |
|-----------|----------|
| Activate same fault+severity while active | `status: already_active` — no duplicate state |
| Activate same fault with different severity | `status: updated` — replaces delay (no stacking) |
| Deactivate when inactive | HTTP 404 `not_active` |

### Injection point

Artificial delay runs in `beforePayment` for `POST /payments` only (async `setTimeout`). It does **not** delay `/health/*`, `/metrics`, or `/faults*`.

## Prometheus metrics

```text
fault_injection_active{fault,severity}     # Gauge 0|1
fault_injections_total{fault,severity,action}  # Counter activate|deactivate
```

Structured JSON logs emit `event=fault_injection` with activate/deactivate timestamps.

## Source

Implementation lives in:

```text
application/order-service/payment-service/src/fault-controller.ts
application/order-service/payment-service/src/fault-types.ts
application/order-service/payment-service/src/main.ts
```

## Experiments

- Definition (not executed in Phase 2A): [`../experiments/E001/`](../experiments/E001/)
- Protocol: [`../research/fault-matrix.md`](../research/fault-matrix.md)
