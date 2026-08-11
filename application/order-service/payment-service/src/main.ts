import { randomUUID } from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { FaultController, sleep } from './fault-controller';
import {
  FaultInjectionHooks,
  noopFaultHooks,
  PaymentInput,
  PaymentResult,
} from './fault-hooks';
import { isFaultSeverity, isFaultType } from './fault-types';
import { PaymentMetrics } from './metrics';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

export function log(
  level: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
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

function isExcludedFromWorkloadMetrics(path: string): boolean {
  return (
    path === '/metrics' ||
    path === '/health' ||
    path.startsWith('/health/') ||
    path === '/faults' ||
    path.startsWith('/faults/')
  );
}

function normalizeRoute(path: string): string {
  if (path === '/payments') {
    return '/payments';
  }
  return path;
}

function hooksFromController(controller: FaultController): FaultInjectionHooks {
  return {
    async beforePayment(): Promise<void> {
      const delayMs = controller.getPaymentLatencyMs();
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    },
    async afterPayment(): Promise<void> {
      // reserved for future fault types
    },
    async shouldFail(): Promise<null> {
      return null;
    },
  };
}

export interface CreateAppOptions {
  /** Override hooks (tests). Default: hooks derived from FaultController. */
  hooks?: FaultInjectionHooks;
  metrics?: PaymentMetrics;
  faultController?: FaultController;
}

export interface PaymentApp {
  app: express.Express;
  metrics: PaymentMetrics;
  faultController: FaultController;
}

export function createApp(options: CreateAppOptions = {}): PaymentApp {
  const metrics = options.metrics ?? new PaymentMetrics();
  const faultController =
    options.faultController ??
    new FaultController(
      {
        setActive: (fault, severity, active) =>
          metrics.setFaultActive(fault, severity, active),
        recordLifecycle: (fault, severity, action) =>
          metrics.recordFaultLifecycle(fault, severity, action),
      },
      log,
    );
  const hooks = options.hooks ?? hooksFromController(faultController);

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

  // Workload HTTP metrics (excludes /health*, /metrics, /faults*)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isExcludedFromWorkloadMetrics(req.path)) {
      next();
      return;
    }

    const method = req.method;
    const route = normalizeRoute(req.path);
    const endTimer = metrics.httpRequestDuration.startTimer();
    metrics.httpActiveRequests.inc();

    res.on('finish', () => {
      const statusCode = String(res.statusCode);
      const labels = { method, route, status_code: statusCode };
      metrics.httpRequestsTotal.inc(labels);
      endTimer(labels);
      if (res.statusCode >= 400) {
        metrics.httpErrorsTotal.inc(labels);
      }
      metrics.httpActiveRequests.dec();
    });

    next();
  });

  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', metrics.contentType());
    res.setHeader('Cache-Control', 'no-store');
    res.send(await metrics.metricsText());
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Backward-compatible alias used by older clients. */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /**
   * Fault control API (experimental instrument).
   * Cluster-internal only — no public Ingress.
   */
  app.get('/faults', (_req, res) => {
    res.json({ faults: faultController.listStates() });
  });

  app.post('/faults', (req, res) => {
    const body = req.body as { fault?: unknown; severity?: unknown };
    if (!isFaultType(body.fault)) {
      res.status(400).json({
        message: 'Unsupported or missing fault. Supported: payment_latency',
      });
      return;
    }
    if (!isFaultSeverity(body.severity)) {
      res.status(400).json({
        message: 'Unsupported or missing severity. Supported: low, medium, high',
      });
      return;
    }

    const result = faultController.activate(body.fault, body.severity);
    res.status(200).json(result);
  });

  app.delete('/faults/:fault', (req, res) => {
    const faultParam = req.params.fault;
    if (!isFaultType(faultParam)) {
      res.status(404).json({
        message: `Unknown fault: ${faultParam}`,
      });
      return;
    }

    const result = faultController.deactivate(faultParam);
    if (result.status === 'not_active') {
      res.status(404).json(result);
      return;
    }
    res.status(200).json(result);
  });

  /**
   * POST /payments
   * Happy-path mock payment. F01 latency is applied via beforePayment when active.
   */
  app.post('/payments', async (req: Request, res: Response) => {
    const requestId = (req as Request & { requestId: string }).requestId;
    const body = req.body as Partial<PaymentInput>;

    if (!body.orderId || !body.productId || typeof body.quantity !== 'number') {
      log('warn', 'payment_invalid_request', { requestId, body });
      metrics.paymentRequestsTotal.inc({ result: 'failure' });
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
        metrics.paymentRequestsTotal.inc({ result: 'failure' });
        res.status(502).json({ message });
        return;
      }

      const result: PaymentResult = {
        paymentId: `payment-${randomUUID()}`,
        status: 'APPROVED',
      };

      await hooks.afterPayment?.(input, result);

      metrics.paymentRequestsTotal.inc({ result: 'success' });
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
      metrics.paymentRequestsTotal.inc({ result: 'failure' });
      res.status(500).json({ message });
    }
  });

  return { app, metrics, faultController };
}

if (require.main === module) {
  const { app } = createApp();
  app.listen(PORT, () => {
    log('info', 'payment_service_started', { port: PORT });
  });
}

// Re-export for tests that still import createApp as Express factory helpers
export { noopFaultHooks };
