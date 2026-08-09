import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { context, propagation, trace } from '@opentelemetry/api';
import { PinoLogger } from 'nestjs-pino';
import { MetricsService } from '../telemetry/metrics.service';
import { PaymentError } from './payment.errors';
import { PaymentRequest, PaymentResponse } from './payment.types';

@Injectable()
export class PaymentClient {
  private readonly baseUrl: string;
  private readonly tracer = trace.getTracer('payment-client');

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
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

      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          accept: 'application/json',
        };
        propagation.inject(context.active(), headers);

        const response = await fetch(`${this.baseUrl}/payments`, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          this.metrics.paymentErrors.inc({ error_type: 'http_error' });
          const body = await response.text();
          throw new PaymentError(
            `Payment service responded with ${response.status}: ${body || response.statusText}`,
          );
        }

        const data = (await response.json()) as PaymentResponse;
        if (data.status !== 'APPROVED') {
          this.metrics.paymentErrors.inc({ error_type: 'declined' });
          throw new PaymentError(`Payment declined with status ${data.status}`);
        }

        span.setAttribute('payment.id', data.paymentId);
        span.setAttribute('payment.status', data.status);
        return data;
      } catch (error) {
        if (!(error instanceof PaymentError)) {
          this.metrics.paymentErrors.inc({ error_type: 'network_error' });
        }
        span.recordException(error as Error);
        throw error;
      } finally {
        endTimer();
        span.end();
      }
    });
  }
}
