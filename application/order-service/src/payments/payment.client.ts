import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { context, propagation, trace } from '@opentelemetry/api';
import { PinoLogger } from 'nestjs-pino';
import { RemediationService } from '../remediation/remediation.service';
import { MetricsService } from '../telemetry/metrics.service';
import { PaymentError, PaymentTimeoutError } from './payment.errors';
import { PaymentRequest, PaymentResponse } from './payment.types';

@Injectable()
export class PaymentClient {
  private readonly baseUrl: string;
  private readonly tracer = trace.getTracer('payment-client');

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly remediation: RemediationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PaymentClient.name);
    this.baseUrl = this.config.get<string>('app.paymentServiceUrl', 'http://localhost:3001');
  }

  async charge(request: PaymentRequest): Promise<PaymentResponse> {
    const endTimer = this.metrics.paymentRequestDuration.startTimer();

    return this.tracer.startActiveSpan('payment.charge', async (span) => {
      span.setAttribute('order.id', request.orderId);
      span.setAttribute('product.id', request.productId);
      span.setAttribute('order.quantity', request.quantity);

      const timeoutMs = this.remediation.getActivePaymentTimeoutMs();
      if (timeoutMs !== null) {
        span.setAttribute('payment.timeout_ms', timeoutMs);
      }

      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          accept: 'application/json',
        };
        propagation.inject(context.active(), headers);

        const init: RequestInit = {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        };
        if (timeoutMs !== null) {
          init.signal = AbortSignal.timeout(timeoutMs);
        }

        const response = await fetch(`${this.baseUrl}/payments`, init);

        if (!response.ok) {
          this.metrics.paymentRequestsTotal.inc({ result: 'failure' });
          const body = await response.text();
          throw new PaymentError(
            `Payment service responded with ${response.status}: ${body || response.statusText}`,
          );
        }

        const data = (await response.json()) as PaymentResponse;
        if (data.status !== 'APPROVED') {
          this.metrics.paymentRequestsTotal.inc({ result: 'failure' });
          throw new PaymentError(`Payment declined with status ${data.status}`);
        }

        this.metrics.paymentRequestsTotal.inc({ result: 'success' });
        span.setAttribute('payment.id', data.paymentId);
        span.setAttribute('payment.status', data.status);
        return data;
      } catch (error) {
        if (this.isAbortError(error) && timeoutMs !== null) {
          this.metrics.paymentTimeoutsTotal.inc();
          this.metrics.paymentRequestsTotal.inc({ result: 'failure' });
          const timeoutError = new PaymentTimeoutError(timeoutMs);
          span.recordException(timeoutError);
          this.logger.warn(
            {
              event: 'payment_timeout',
              orderId: request.orderId,
              timeout_ms: timeoutMs,
            },
            'Payment request timed out (R01)',
          );
          throw timeoutError;
        }

        if (!(error instanceof PaymentError)) {
          this.metrics.paymentRequestsTotal.inc({ result: 'failure' });
        }
        span.recordException(error as Error);
        throw error;
      } finally {
        endTimer();
        span.end();
      }
    });
  }

  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const name = (error as { name?: string }).name;
    return name === 'TimeoutError' || name === 'AbortError';
  }
}
