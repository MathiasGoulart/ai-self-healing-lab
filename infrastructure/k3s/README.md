# k3s deployment (Phase 1.5)

Deploy the Phase 1 Order Processing Service to the home **k3s** cluster for controlled experiments.

> No AI, self-healing, fault injection, or external agents in this phase.

## Layout

```text
infrastructure/k3s/
├── namespace.yaml
├── postgres/
│   ├── configmap.yaml
│   ├── deployment.yaml
│   └── secret.example.yaml
├── payment-service/
│   └── deployment.yaml
└── order-service/
    └── deployment.yaml
```

Namespace: `ai-self-healing`

```text
order-service ──► postgres
      │
      └──► payment-service
```

## Prerequisites

- `kubectl` configured for the home k3s cluster (example context: `rooteny-kubernetes`)
- Images published to GitHub Container Registry (GHCR) by CI — see below

```bash
kubectl --context rooteny-kubernetes get nodes
```

## 1. Build & publish images (GHCR)

Images are built by GitHub Actions and pushed to GHCR:

| Workload | Image |
|----------|-------|
| order-service | `ghcr.io/mathiasgoulart/ai-self-healing-lab/order-service:latest` |
| payment-service | `ghcr.io/mathiasgoulart/ai-self-healing-lab/payment-service:latest` |
| postgres | `postgres:16-alpine` (Docker Hub) |

Workflow: [`.github/workflows/publish-images.yml`](../../.github/workflows/publish-images.yml)

Triggers:
- **pull request → `main`** (any feature branch), when `application/order-service/**` changes
- **push to `main`** (after merge)
- manual: **Actions → Publish container images → Run workflow**

Tags published:
| Event | Example tags |
|-------|----------------|
| PR #42 | `pr-42`, `sha-<commit>` |
| merge/push to `main` | `latest`, `sha-<commit>`, `main` |

`latest` is updated **only** on `main`. For a PR, point the Deployment at `:pr-<number>` to test before merge.

Platform: `linux/amd64` (matches the lab’s Ubuntu k3s nodes).

### One-time GitHub setup (required even if the repo is public)

1. **Actions write permission**  
   Repo → **Settings → Actions → General → Workflow permissions** → **Read and write permissions** → Save.

2. **Run the workflow** once so the packages are created.

3. **Make the packages public** (GHCR packages are often **private by default**, even for public repos):
   - Open https://github.com/MathiasGoulart/ai-self-healing-lab/pkgs/container/ai-self-healing-lab%2Forder-service  
   - **Package settings → Change visibility → Public**  
   - Repeat for `ai-self-healing-lab/payment-service`

4. **No `imagePullSecret` needed** when both packages are Public. The cluster pulls anonymously from `ghcr.io`.

Pin a reproducible build by changing the Deployment tag from `:latest` to `:sha-<gitsha>` (also published by the workflow).

## 2. Deploy from GHCR

After the packages are public and the workflow succeeded:

```bash
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/payment-service/deployment.yaml
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/order-service/deployment.yaml
kubectl --context rooteny-kubernetes -n ai-self-healing rollout restart deploy/payment-service deploy/order-service
kubectl --context rooteny-kubernetes -n ai-self-healing get pods -o wide
```

Deployments use `imagePullPolicy: Always` for `:latest`.

---

## 3. Create namespace and database secret

```bash
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/namespace.yaml

# Lab credentials (example). Prefer creating the Secret without committing it.
kubectl --context rooteny-kubernetes -n ai-self-healing create secret generic postgres-credentials \
  --from-literal=POSTGRES_USER=orders \
  --from-literal=POSTGRES_PASSWORD='orders' \
  --from-literal=POSTGRES_DB=orders \
  --from-literal=DATABASE_URL='postgres://orders:orders@postgres:5432/orders' \
  --dry-run=client -o yaml | kubectl --context rooteny-kubernetes apply -f -
```

`postgres/secret.example.yaml` shows the expected keys. Do not commit real credentials.

## 4. Deploy PostgreSQL

```bash
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/postgres/configmap.yaml
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/postgres/deployment.yaml

kubectl --context rooteny-kubernetes -n ai-self-healing rollout status deploy/postgres
kubectl --context rooteny-kubernetes -n ai-self-healing get pods,svc -l app.kubernetes.io/name=postgres
```

Postgres uses `emptyDir` (ephemeral lab storage). Schema is applied from the `postgres-init` ConfigMap.

## 5. Deploy payment-service

(Requires GHCR images — section 1–2.)

```bash
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/payment-service/deployment.yaml
kubectl --context rooteny-kubernetes -n ai-self-healing rollout status deploy/payment-service
```

order-service reaches it at `http://payment-service:3001`.

## 6. Deploy order-service

```bash
kubectl --context rooteny-kubernetes apply -f infrastructure/k3s/order-service/deployment.yaml
kubectl --context rooteny-kubernetes -n ai-self-healing rollout status deploy/order-service
```

### Resources (order-service)

| | CPU | Memory |
|---|-----|--------|
| requests | 50m | 128Mi |
| limits | 500m | 512Mi |

Modest home-lab defaults; also useful later for saturation experiments.

### Probes

- Liveness: `GET /health/live`
- Readiness: `GET /health/ready` (checks PostgreSQL + payment-service)

`/metrics` is **not** used as a health check.

## 7. Check status

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing get pods,svc
kubectl --context rooteny-kubernetes -n ai-self-healing describe pod -l app.kubernetes.io/name=order-service
```

Expected: all pods `Running`, Services for `postgres`, `payment-service`, `order-service`.

## 8. Test the API

Port-forward:

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing port-forward svc/order-service 3000:3000
```

```bash
curl -s http://localhost:3000/health/live
curl -s http://localhost:3000/health/ready

ORDER=$(curl -s -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{"productId":"product-123","quantity":2}')
echo "$ORDER"

OID=$(echo "$ORDER" | jq -r .id)
curl -s -X POST "http://localhost:3000/orders/$OID/process"
```

## 9. Access `/metrics`

```bash
curl -s http://localhost:3000/metrics | head
```

Generate traffic, then confirm counters/histograms move:

```bash
curl -s http://localhost:3000/metrics | grep -E \
  'http_requests_total|http_request_duration_seconds_bucket|orders_processing_total|payment_requests_total|payment_request_duration_seconds|database_pool_|nodejs_eventloop|process_cpu|process_resident_memory|nodejs_heap'
```

## 10. Verify research metrics manually

| Research need | Metric(s) | Notes |
|---------------|-----------|-------|
| Throughput | `http_requests_total` | `rate(...[1m])` |
| Latency / p50 p95 p99 | `http_request_duration_seconds_bucket` | `histogram_quantile` |
| Order processing latency | `order_processing_duration_seconds` | histogram |
| Error rate | `http_requests_total{status_code=~"5.."}` / total | also `http_errors_total` |
| Order outcomes | `orders_processing_total{result=...}` | `success` / `failure` |
| CPU | `process_cpu_seconds_total` | rate for CPU usage |
| Memory RSS | `process_resident_memory_bytes` | gauge |
| Heap used / total | `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes` | |
| DB pool active | `database_pool_active_connections` | critical for pool-exhaustion faults |
| DB pool idle | `database_pool_idle_connections` | |
| DB pool waiting | `database_pool_waiting_requests` | |
| Event-loop delay | `nodejs_eventloop_delay_seconds` (+ prom-client `nodejs_eventloop_lag_*`) | |
| Payment latency | `payment_request_duration_seconds` | histogram → p50/p95/p99 |
| Payment results | `payment_requests_total{result=...}` | `success` / `error` / `declined` |

See [`docs/observability.md`](../../docs/observability.md) for PromQL examples.

## Prometheus scrape (optional)

This phase does **not** deploy Prometheus. If kube-prometheus (or similar) already runs on the cluster, scrape:

```text
order-service.ai-self-healing.svc:3000/metrics
```

Pod annotations are present (`prometheus.io/scrape=true`). Prefer a static scrape config over introducing a ServiceMonitor/operator dependency here.

Example scrape snippet:

```yaml
- job_name: order-service
  static_configs:
    - targets: ['order-service.ai-self-healing.svc.cluster.local:3000']
  metrics_path: /metrics
```

## Teardown

```bash
kubectl --context rooteny-kubernetes delete namespace ai-self-healing
```

## Out of scope (Phase 1.5)

- Helm / Argo CD / operators / service mesh
- Persistent distributed storage
- Fault injection, AI, external agents
- Grafana dashboards as deliverables
