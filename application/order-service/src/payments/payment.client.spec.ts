import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MetricsService } from '../telemetry/metrics.service';
import { RemediationService } from '../remediation/remediation.service';
import { PaymentClient } from './payment.client';
import { PaymentTimeoutError } from './payment.errors';

describe('PaymentClient R01 timeout', () => {
  let client: PaymentClient;
  let remediation: { getActivePaymentTimeoutMs: jest.Mock };
  let paymentTimeoutsTotal: { inc: jest.Mock };
  let paymentRequestsTotal: { inc: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    paymentTimeoutsTotal = { inc: jest.fn() };
    paymentRequestsTotal = { inc: jest.fn() };
    remediation = { getActivePaymentTimeoutMs: jest.fn().mockReturnValue(null) };

    const metrics = {
      paymentRequestDuration: { startTimer: () => jest.fn() },
      paymentRequestsTotal,
      paymentTimeoutsTotal,
    } as unknown as MetricsService;

    const config = {
      get: jest.fn().mockReturnValue('http://payment.test'),
    } as unknown as ConfigService;

    const logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as PinoLogger;

    client = new PaymentClient(
      config,
      metrics,
      remediation as unknown as RemediationService,
      logger,
    );

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not set AbortSignal when remediation is inactive', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ paymentId: 'p-1', status: 'APPROVED' }),
    });

    await client.charge({
      orderId: 'o-1',
      productId: 'product-123',
      quantity: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://payment.test/payments',
      expect.not.objectContaining({ signal: expect.anything() }),
    );
    expect(paymentTimeoutsTotal.inc).not.toHaveBeenCalled();
  });

  it('applies AbortSignal.timeout when R01 is active', async () => {
    remediation.getActivePaymentTimeoutMs.mockReturnValue(300);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ paymentId: 'p-1', status: 'APPROVED' }),
    });

    await client.charge({
      orderId: 'o-1',
      productId: 'product-123',
      quantity: 1,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeDefined();
    expect(paymentTimeoutsTotal.inc).not.toHaveBeenCalled();
  });

  it('increments payment_timeouts_total and throws PaymentTimeoutError on abort', async () => {
    remediation.getActivePaymentTimeoutMs.mockReturnValue(300);
    const abortError = new Error('The operation was aborted due to timeout');
    abortError.name = 'TimeoutError';
    fetchMock.mockRejectedValue(abortError);

    await expect(
      client.charge({
        orderId: 'o-1',
        productId: 'product-123',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(PaymentTimeoutError);

    expect(paymentTimeoutsTotal.inc).toHaveBeenCalledTimes(1);
    expect(paymentRequestsTotal.inc).toHaveBeenCalledWith({ result: 'failure' });
  });
});
