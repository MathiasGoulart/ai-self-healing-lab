import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { Order } from '../src/orders/order.entity';
import { OrderStatus } from '../src/orders/order-status.enum';
import { startTelemetry } from '../src/telemetry/otel';

describe('Orders API (e2e)', () => {
  let app: INestApplication<App>;
  let ordersRepo: Repository<Order>;
  let paymentServer: Server;
  let paymentShouldFail = false;
  let paymentDelayMs = 0;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.SEED_ON_STARTUP = 'false';
    process.env.TYPEORM_SYNC = 'true';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'postgres://orders:orders@localhost:5432/orders';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = '';

    const paymentApp = express();
    paymentApp.use(express.json());
    paymentApp.get('/health', (_req, res) => res.json({ status: 'ok' }));
    paymentApp.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
    paymentApp.get('/health/ready', (_req, res) => res.json({ status: 'ok' }));
    paymentApp.post('/payments', (req, res) => {
      const respond = () => {
        if (paymentShouldFail) {
          res.status(502).json({ message: 'injected payment failure' });
          return;
        }
        res.json({
          paymentId: `payment-${randomUUID()}`,
          status: 'APPROVED',
        });
      };
      if (paymentDelayMs > 0) {
        setTimeout(respond, paymentDelayMs);
        return;
      }
      respond();
    });

    await new Promise<void>((resolve) => {
      paymentServer = paymentApp.listen(0, '127.0.0.1', () => resolve());
    });
    const address = paymentServer.address() as AddressInfo;
    process.env.PAYMENT_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    await startTelemetry();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    ordersRepo = app.get(getRepositoryToken(Order));
  });

  beforeEach(async () => {
    paymentShouldFail = false;
    paymentDelayMs = 0;
    await ordersRepo.clear();
    // Ensure R01 is off between tests
    await request(app.getHttpServer()).delete('/remediation/payment_timeout');
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve, reject) => {
      paymentServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe('POST /orders', () => {
    it('creates an order for a valid request', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'product-123', quantity: 2 })
        .expect(201);

      expect(response.body).toMatchObject({
        productId: 'product-123',
        quantity: 2,
        status: OrderStatus.PENDING,
        paymentId: null,
      });
      expect(response.body.id).toBeDefined();
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('rejects an invalid request', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: '', quantity: 0 })
        .expect(400);
    });
  });

  describe('POST /orders/:id/process', () => {
    it('processes an order when payment succeeds', async () => {
      const created = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'product-123', quantity: 1 })
        .expect(201);

      const processed = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/process`)
        .expect(200);

      expect(processed.body.status).toBe(OrderStatus.PAID);
      expect(processed.body.paymentId).toMatch(/^payment-/);
    });

    it('marks the order FAILED when payment fails', async () => {
      paymentShouldFail = true;
      const created = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'product-123', quantity: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/process`)
        .expect(502);

      const order = await ordersRepo.findOneByOrFail({ id: created.body.id });
      expect(order.status).toBe(OrderStatus.FAILED);
    });

    it('returns 404 when the order does not exist', async () => {
      await request(app.getHttpServer())
        .post('/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/process')
        .expect(404);
    });

    it('returns 400 for an invalid order state', async () => {
      const created = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'product-123', quantity: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/process`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/process`)
        .expect(400);
    });
  });

  describe('R01 remediation actuator', () => {
    it('activates, exposes metrics, and clears payment timeout via HTTP adapter', async () => {
      const off = await request(app.getHttpServer()).get('/remediation').expect(200);
      expect(off.body.remediations[0].enabled).toBe(false);

      const activate = await request(app.getHttpServer())
        .post('/remediation/payment_timeout')
        .send({ enabled: true, timeout_ms: 300 })
        .expect(201);
      expect(activate.body.status).toBe('activated');
      expect(activate.body.state.enabled).toBe(true);
      expect(activate.body.state.timeout_ms).toBe(300);

      const on = await request(app.getHttpServer()).get('/remediation').expect(200);
      expect(on.body.remediations[0].enabled).toBe(true);

      const metrics = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(metrics.text).toContain('remediation_active');
      expect(metrics.text).toContain('action="payment_timeout"');
      expect(metrics.text).toMatch(/remediation_active\{[^}]*action="payment_timeout"[^}]*\} 1\b/);
      expect(metrics.text).toMatch(/remediation_payment_timeout_ms(?:\{[^}]*\})? 300\b/);
      expect(metrics.text).toContain('payment_timeouts_total');

      const health = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(health.body.status).toBe('ok');

      const clear = await request(app.getHttpServer())
        .delete('/remediation/payment_timeout')
        .expect(200);
      expect(clear.body.status).toBe('deactivated');

      const metricsAfter = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(metricsAfter.text).toMatch(/remediation_active\{[^}]*action="payment_timeout"[^}]*\} 0\b/);
      expect(metricsAfter.text).toMatch(/remediation_payment_timeout_ms(?:\{[^}]*\})? 0\b/);
    });

    it('rejects out-of-bounds timeout_ms', async () => {
      await request(app.getHttpServer())
        .post('/remediation/payment_timeout')
        .send({ enabled: true, timeout_ms: 200 })
        .expect(400);
      await request(app.getHttpServer())
        .post('/remediation/payment_timeout')
        .send({ enabled: true, timeout_ms: 500 })
        .expect(400);

      const state = await request(app.getHttpServer()).get('/remediation').expect(200);
      expect(state.body.remediations[0].enabled).toBe(false);
    });

    it('contains slow payment: order FAILED and payment_timeouts_total increments', async () => {
      paymentDelayMs = 800;

      await request(app.getHttpServer())
        .post('/remediation/payment_timeout')
        .send({ enabled: true, timeout_ms: 300 })
        .expect(201);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'product-123', quantity: 1 })
        .expect(201);

      const before = await request(app.getHttpServer()).get('/metrics').expect(200);
      const beforeMatch = before.text.match(/^payment_timeouts_total(?:\{[^}]*\})? (\d+)/m);
      const beforeCount = beforeMatch ? Number(beforeMatch[1]) : 0;

      const t0 = Date.now();
      const processed = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/process`)
        .expect(502);
      const elapsed = Date.now() - t0;

      expect(processed.body.remediation).toBe('payment_timeout');
      expect(elapsed).toBeGreaterThanOrEqual(250);
      expect(elapsed).toBeLessThan(700);

      const order = await ordersRepo.findOneByOrFail({ id: created.body.id });
      expect(order.status).toBe(OrderStatus.FAILED);

      const after = await request(app.getHttpServer()).get('/metrics').expect(200);
      const afterMatch = after.text.match(/^payment_timeouts_total(?:\{[^}]*\})? (\d+)/m);
      const afterCount = afterMatch ? Number(afterMatch[1]) : 0;
      expect(afterCount).toBeGreaterThan(beforeCount);

      // Note: local mock has no FaultController — future k3s smoke must assert
      // fault_injection_active=1 AND remediation_active=1 simultaneously.
    }, 15000);
  });

  describe('health and metrics', () => {
    it('exposes liveness', async () => {
      const response = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(response.body.status).toBe('ok');
    });

    it('exposes prometheus metrics without health-probe contamination', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);
      await request(app.getHttpServer()).get('/health/ready').expect(200);

      const before = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(before.text).toContain('http_requests_total');
      expect(before.text).toContain('http_request_duration_seconds');
      expect(before.text).toContain('orders_created_total');
      expect(before.text).toContain('orders_processing_total');
      expect(before.text).toContain('payment_requests_total');
      expect(before.text).toContain('payment_request_duration_seconds');
      expect(before.text).toContain('database_pool_active_connections');
      expect(before.text).toContain('database_pool_idle_connections');
      expect(before.text).toContain('database_pool_waiting_requests');
      expect(before.text).toContain('nodejs_eventloop_delay_seconds');
      expect(before.text).toContain('process_cpu_seconds_total');
      expect(before.text).toContain('process_resident_memory_bytes');
      expect(before.text).toContain('nodejs_heap_size_used_bytes');
      expect(before.text).not.toContain('nodejs_eventloop_lag_p50_seconds');
      expect(before.text).not.toContain('nodejs_eventloop_lag_p99_seconds');
      expect(before.text).not.toMatch(/http_requests_total\{[^}]*route="\/health/);

      await request(app.getHttpServer())
        .post('/orders')
        .send({ productId: 'product-metrics', quantity: 1 })
        .expect(201);

      const after = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(after.text).toMatch(/http_requests_total\{method="POST",route="\/orders"/);
    });
  });
});
