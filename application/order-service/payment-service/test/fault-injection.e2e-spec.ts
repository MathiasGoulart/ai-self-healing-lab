import request from 'supertest';
import { createApp } from '../src/main';

const paymentBody = {
  orderId: '11111111-1111-4111-8111-111111111111',
  productId: 'product-123',
  quantity: 1,
};

describe('F01 payment latency injection (e2e)', () => {
  it('normal → F01 medium slower → deactivate recovers; health/metrics unaffected', async () => {
    const { app } = createApp();

    const faultsOff = await request(app).get('/faults');
    expect(faultsOff.status).toBe(200);
    expect(faultsOff.body.faults[0].active).toBe(false);

    const t0 = Date.now();
    const normal = await request(app).post('/payments').send(paymentBody);
    const normalMs = Date.now() - t0;
    expect(normal.status).toBe(200);
    expect(normalMs).toBeLessThan(400);

    const activate = await request(app)
      .post('/faults')
      .send({ fault: 'payment_latency', severity: 'medium' });
    expect(activate.status).toBe(200);
    expect(activate.body.status).toBe('activated');
    expect(activate.body.state.parameter_ms).toBe(2000);

    const healthLive = await request(app).get('/health/live');
    const healthReady = await request(app).get('/health/ready');
    const metrics = await request(app).get('/metrics');
    expect(healthLive.status).toBe(200);
    expect(healthReady.status).toBe(200);
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain('fault_injection_active');
    expect(metrics.text).toContain('fault="payment_latency"');
    expect(metrics.text).toContain('severity="medium"');
    expect(metrics.text).toMatch(/fault_injection_active\{[^}]+\} 1\b/);

    const t1 = Date.now();
    const slow = await request(app).post('/payments').send(paymentBody);
    const slowMs = Date.now() - t1;
    expect(slow.status).toBe(200);
    expect(slowMs).toBeGreaterThanOrEqual(1800);
    expect(slowMs).toBeLessThan(3500);

    const deactivate = await request(app).delete('/faults/payment_latency');
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.status).toBe('deactivated');

    const metricsAfter = await request(app).get('/metrics');
    expect(metricsAfter.text).toMatch(/fault_injection_active\{[^}]*severity="medium"[^}]*\} 0\b/);

    const t2 = Date.now();
    const recovered = await request(app).post('/payments').send(paymentBody);
    const recoveredMs = Date.now() - t2;
    expect(recovered.status).toBe(200);
    expect(recoveredMs).toBeLessThan(400);
  }, 20000);

  it('applies approximately 500ms for low and 5000ms for high', async () => {
    const { app } = createApp();

    await request(app).post('/faults').send({ fault: 'payment_latency', severity: 'low' });
    const tLow = Date.now();
    await request(app).post('/payments').send(paymentBody);
    const lowMs = Date.now() - tLow;
    expect(lowMs).toBeGreaterThanOrEqual(400);
    expect(lowMs).toBeLessThan(1200);

    await request(app).post('/faults').send({ fault: 'payment_latency', severity: 'high' });
    const tHigh = Date.now();
    await request(app).post('/payments').send(paymentBody);
    const highMs = Date.now() - tHigh;
    expect(highMs).toBeGreaterThanOrEqual(4500);
    expect(highMs).toBeLessThan(7000);

    await request(app).delete('/faults/payment_latency');
  }, 30000);

  it('rejects arbitrary delay / unknown fault', async () => {
    const { app } = createApp();
    const bad = await request(app)
      .post('/faults')
      .send({ fault: 'payment_latency', severity: 'extreme' });
    expect(bad.status).toBe(400);

    const unknown = await request(app)
      .post('/faults')
      .send({ fault: 'cpu_saturation', severity: 'medium' });
    expect(unknown.status).toBe(400);
  });

  it('duplicate activate is idempotent; health stays fast under F01', async () => {
    const { app } = createApp();
    await request(app).post('/faults').send({ fault: 'payment_latency', severity: 'high' });
    const again = await request(app)
      .post('/faults')
      .send({ fault: 'payment_latency', severity: 'high' });
    expect(again.body.status).toBe('already_active');

    const t = Date.now();
    const live = await request(app).get('/health/live');
    expect(live.status).toBe(200);
    expect(Date.now() - t).toBeLessThan(200);

    await request(app).delete('/faults/payment_latency');
  });
});
