# Order Processing Service (Phase 1)

Minimal NestJS **Order Processing Service** used as the experimental subject for AI-driven self-healing research.

This is a **scientific instrument**, not a product: small, deterministic, observable, and designed so fault injection can be added later.

> **AI and autonomous self-healing are intentionally NOT part of Phase 1.**

Part of the parent research repository. Research methodology lives in [`../../research/`](../../research/).

---

## Flows

### Create order

```text
Client → POST /orders → PostgreSQL → Order (PENDING)
```

### Process order

```text
Client → POST /orders/:id/process
           ├─ PostgreSQL (PENDING → PROCESSING)
           ├─ Payment Service (POST /payments)
           └─ PostgreSQL (PROCESSING → PAID | FAILED)
```

### State machine

```text
PENDING → PROCESSING → PAID
                 ↘
                  FAILED
```

---

## How to run

From this directory:

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Order Service | http://localhost:3000 |
| Payment Service | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Swagger UI | http://localhost:3000/docs |
| Metrics | http://localhost:3000/metrics |

### Smoke test

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{"productId":"product-123","quantity":2}'

# Replace ORDER_ID
curl -s -X POST http://localhost:3000/orders/ORDER_ID/process
```

### Local development

```bash
cp .env.example .env
npm install
cd payment-service && npm install && cd ..

docker compose up -d postgres payment-service
npm run start:dev
```

### Seed data

```bash
SEED_ON_STARTUP=true   # also enabled in docker-compose for order-service
# or
npm run seed
```

Creates three `PENDING` orders for `product-100`, `product-200`, `product-300` when the table is empty. There is no product management API.

---

## Tests

```bash
npm test

docker compose up -d postgres
DATABASE_URL=postgres://orders:orders@localhost:5432/orders npm run test:e2e
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Create order |
| `POST` | `/orders/:id/process` | Process order |
| `GET` | `/health/live` | Liveness |
| `GET` | `/health/ready` | Readiness (Postgres + Payment Service) |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/docs` | OpenAPI / Swagger |

---

## Metrics

Exposed at `GET /metrics`:

| Metric | Description |
|--------|-------------|
| `http_requests_total` | HTTP request count (`method`, `route`, `status_code`) |
| `http_request_duration_seconds` | HTTP request duration |
| `http_errors_total` | HTTP errors (status ≥ 400) |
| `http_active_requests` | In-flight HTTP requests |
| `nodejs_*` | Process CPU, memory, event-loop defaults |
| `pg_pool_*` | PostgreSQL pool usage |
| `order_processing_duration_seconds` | Order processing duration |
| `payment_request_duration_seconds` | Payment call duration |
| `payment_errors_total` | Payment errors |
| `orders_created_total` | Orders created |
| `orders_processed_success_total` | Successful processing |
| `orders_processed_failure_total` | Failed processing |

---

## Telemetry

### Structured JSON logs

Correlation via `x-request-id` / `req.id`. Events include:

`order_created`, `order_processing_started`, `payment_started`, `payment_completed`, `payment_failed`, `order_processing_completed`, `order_processing_failed`

Logs include `traceId` / `spanId` where practical.

### OpenTelemetry

HTTP and PostgreSQL auto-instrumentation. OTLP export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; otherwise console exporter on stdout.

---

## Configuration

See `.env.example`:

| Variable | Description |
|----------|-------------|
| `PORT` | Order service port |
| `DATABASE_URL` | PostgreSQL URL |
| `PAYMENT_SERVICE_URL` | Mock payment base URL |
| `LOG_LEVEL` | Pino log level |
| `OTEL_SERVICE_NAME` | Trace service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP endpoint |
| `SEED_ON_STARTUP` | Seed on boot |

---

## Layout

```text
src/
├── orders/
├── payments/          # client to mock payment-service
├── database/
├── health/
├── telemetry/
├── common/
└── main.ts
payment-service/       # mock dependency (fault hooks are no-ops)
test/
docker/
```

---

## Current limitations

- No auth, UI, real payment provider, Kafka/Redis, Kubernetes, AI, or fault injection
- Tracing backend optional (console by default)
- Single `orders` table

These are intentional for Phase 1.
