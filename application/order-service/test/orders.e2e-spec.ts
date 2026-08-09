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
    paymentApp.post('/payments', (req, res) => {
      if (paymentShouldFail) {
        res.status(502).json({ message: 'injected payment failure' });
        return;
      }
      res.json({
        paymentId: `payment-${randomUUID()}`,
        status: 'APPROVED',
      });
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
    await ordersRepo.clear();
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

  describe('health and metrics', () => {
    it('exposes liveness', async () => {
      const response = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(response.body.status).toBe('ok');
    });

    it('exposes prometheus metrics', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('orders_created_total');
      expect(response.text).toContain('nodejs_');
    });
  });
});
