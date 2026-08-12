# Grafana research dashboard

## Apply

```bash
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/grafana/dashboard-ai-self-healing-lab.yaml
```

The kube-prometheus Grafana sidecar loads ConfigMaps labeled `grafana_dashboard=1`.

## Contents

- **Primary SLI — Order Processing p95** (`order_processing_duration_seconds`, 30s rate window)
- Visual **500 ms** experimental threshold line
- Payment client p95, F01 active gauge, HTTP p95, order rates
- Annotation tag convention for E001 markers

Not included (by design): automated 2-of-3 state machine evaluation — that lives in the research protocol.
