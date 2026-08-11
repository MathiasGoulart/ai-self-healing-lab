# k3s deployment (Phase 1.5)

Deploy the Phase 1 Order Processing Service to the home **k3s** cluster for controlled experiments.

> No AI, self-healing, fault injection, or external agents in this phase.

## Layout

```text
infrastructure/k3s/
├── kustomization.yaml          # ← pin sha-<commit> image tags here
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

## Image pinning (research reproducibility)

Research runs **must** use commit-pinned container images:

```text
ghcr.io/mathiasgoulart/ai-self-healing-lab/order-service:sha-<commit>
ghcr.io/mathiasgoulart/ai-self-healing-lab/payment-service:sha-<commit>
```

| Tag | Purpose |
|-----|---------|
| `sha-<commit>` | **Required for experiments** — immutable build of that git revision |
| `latest` | Development convenience only — **do not** use for research runs |
| `main` | Moving branch tip — **do not** use for research runs |

CI continues to publish `latest` (and branch tags) for convenience. The k3s experiment manifests deliberately ignore those.

**Single place to update the pin:** [`kustomization.yaml`](kustomization.yaml) → `images[].newTag`.

Example after CI publishes commit `e48856b`:

```yaml
images:
  - name: ghcr.io/mathiasgoulart/ai-self-healing-lab/order-service
    newTag: sha-e48856b
  - name: ghcr.io/mathiasgoulart/ai-self-healing-lab/payment-service
    newTag: sha-e48856b
```

The short SHA matches GitHub Actions `docker/metadata-action` (`type=sha,prefix=sha-` → 7-character hash).

Deploy with Kustomize (not raw `apply -f` on Deployments alone):

```bash
kubectl --context rooteny-kubernetes apply -k infrastructure/k3s
```

Verify the running tag:

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing get deployment order-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl --context rooteny-kubernetes -n ai-self-healing get deployment payment-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Expected: `…:sha-<commit>`, never `:latest`.

---

## Prerequisites

- `kubectl` configured for the home k3s cluster (example context: `rooteny-kubernetes`)
- Images published to GitHub Container Registry (GHCR) by CI — see below

```bash
kubectl --context rooteny-kubernetes get nodes
```

## 1. Build & publish images (GHCR)

Images are built by GitHub Actions and pushed to GHCR:

| Workload | Image (experiment pin) |
|----------|------------------------|
| order-service | `ghcr.io/mathiasgoulart/ai-self-healing-lab/order-service:sha-<commit>` |
| payment-service | `ghcr.io/mathiasgoulart/ai-self-healing-lab/payment-service:sha-<commit>` |
| postgres | `postgres:16-alpine` (Docker Hub; not app code) |

CI also publishes `:latest` for development; **k3s research manifests must not use it.**


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

`latest` is updated **only** on `main` (dev convenience). Research deployments must pin `sha-<commit>` via `kustomization.yaml`.


Platform: `linux/amd64` (matches the lab’s Ubuntu k3s nodes).

### One-time GitHub setup (required even if the repo is public)

1. **Actions write permission**  
   Repo → **Settings → Actions → General → Workflow permissions** → **Read and write permissions** → Save.

2. **Run the workflow** once so the packages are created.

3. **Make the packages public** (GHCR packages are often **private by default**, even for public repos):
   - Open https://github.com/MathiasGoulart/ai-self-healing-lab/pkgs/container/ai-self-healing-lab%2Forder-service  
   - **Package settings → Change visibility → Public**  
   - Repeat for `ai-self-healing-lab/payment-service`

4. **Pull access for the cluster**
   - **Preferred:** make both packages **Public** → no `imagePullSecret` needed.
   - **Until then** (current lab setup): create a pull secret and keep `imagePullSecrets: [ghcr-pull]` in the Deployments:

```bash
kubectl --context rooteny-kubernetes -n ai-self-healing create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=MathiasGoulart \
  --docker-password="$(gh auth token)" \
  --dry-run=client -o yaml | kubectl --context rooteny-kubernetes apply -f -
```

Use a classic PAT with `read:packages` if `gh auth token` lacks package scope on your machine.

## 2. Deploy from GHCR (commit-pinned)

1. Confirm CI published `sha-<commit>` for the revision under test.
2. Set that tag in `infrastructure/k3s/kustomization.yaml` (`images[].newTag`).
3. Apply the whole overlay:

```bash
kubectl --context rooteny-kubernetes apply -k infrastructure/k3s
kubectl --context rooteny-kubernetes -n ai-self-healing rollout status deploy/payment-service
kubectl --context rooteny-kubernetes -n ai-self-healing rollout status deploy/order-service
kubectl --context rooteny-kubernetes -n ai-self-healing get pods -o wide
```

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

Included in `kubectl apply -k infrastructure/k3s` (section 2). order-service reaches it at `http://payment-service:3001`.

## 6. Deploy order-service

Included in `kubectl apply -k infrastructure/k3s` (section 2). Image tag must remain the `sha-<commit>` pin from `kustomization.yaml`.

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

## Prometheus scrape

This lab’s `rooteny-kubernetes` cluster already runs **kube-prometheus-stack**, which discovers `ServiceMonitor` resources across namespaces.

Manifests:

- `order-service/servicemonitor.yaml` → scrapes `order-service:3000/metrics`
- `payment-service/servicemonitor.yaml` → scrapes `payment-service:3001/metrics`

After `kubectl apply -k infrastructure/k3s`, check Status → Targets in Prometheus (or):

```bash
kubectl --context rooteny-kubernetes -n observability port-forward svc/kps-prometheus 9090:9090
# open http://localhost:9090/targets and look for jobs containing order-service / payment-service
```

Example Grafana / PromQL (needs scrape + some workload traffic for `rate()` to be non-zero):

```promql
sum(rate(http_requests_total{service="order-service"}[1m]))
sum(rate(http_requests_total{service="payment-service"}[1m]))
```

Pod annotations (`prometheus.io/*`) are informational only on this stack; **ServiceMonitors** are what actually enable scraping.

## Teardown

```bash
kubectl --context rooteny-kubernetes delete namespace ai-self-healing
```

## Out of scope (Phase 1.5)

- Helm / Argo CD / operators / service mesh
- Persistent distributed storage
- Fault injection, AI, external agents
- Grafana dashboards as deliverables
