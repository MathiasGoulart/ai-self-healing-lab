import { randomUUID } from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import {
  FaultInjectionHooks,
  noopFaultHooks,
  PaymentInput,
  PaymentResult,
} from './fault-hooks';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

function log(level: string, event: string, fields: Record<string, unknown> = {}): void {
  if (level === 'debug' && LOG_LEVEL !== 'debug') {
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'payment-service',
      event,
      ...fields,
    })}\n`,
  );
}

export function createApp(hooks: FaultInjectionHooks = noopFaultHooks): express.Express {
  const app = express();
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId =
      typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as Request & { requestId: string }).requestId = requestId;
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /**
   * POST /payments
   * Happy-path mock payment. Fault injection hooks are intentional no-ops in Phase 1.
   */
  app.post('/payments', async (req: Request, res: Response) => {
    const requestId = (req as Request & { requestId: string }).requestId;
    const body = req.body as Partial<PaymentInput>;

    if (!body.orderId || !body.productId || typeof body.quantity !== 'number') {
      log('warn', 'payment_invalid_request', { requestId, body });
      res.status(400).json({
        message: 'orderId, productId, and quantity are required',
      });
      return;
    }

    const input: PaymentInput = {
      orderId: body.orderId,
      productId: body.productId,
      quantity: body.quantity,
    };

    try {
      await hooks.beforePayment?.(input);

      const fail = await hooks.shouldFail?.(input);
      if (fail) {
        const message = fail instanceof Error ? fail.message : 'Injected payment failure';
        log('error', 'payment_failed', { requestId, orderId: input.orderId, error: message });
        res.status(502).json({ message });
        return;
      }

      const result: PaymentResult = {
        paymentId: `payment-${randomUUID()}`,
        status: 'APPROVED',
      };

      await hooks.afterPayment?.(input, result);

      log('info', 'payment_completed', {
        requestId,
        orderId: input.orderId,
        paymentId: result.paymentId,
        status: result.status,
      });

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown payment error';
      log('error', 'payment_failed', { requestId, orderId: input.orderId, error: message });
      res.status(500).json({ message });
    }
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    log('info', 'payment_service_started', { port: PORT });
  });
}
