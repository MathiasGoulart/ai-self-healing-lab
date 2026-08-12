import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { MetricsService } from '../telemetry/metrics.service';
import { RemediationController } from './remediation-controller';
import {
  ClearPaymentTimeoutResult,
  PaymentTimeoutStateView,
  REMEDIATION_ACTION_PAYMENT_TIMEOUT,
  SetPaymentTimeoutResult,
} from './remediation-types';

/**
 * Shared R01 actuation surface.
 *
 * Embedded AI should call this service in-process.
 * External Agent / ops use the HTTP adapter which delegates here.
 */
@Injectable()
export class RemediationService {
  private readonly controller: RemediationController;

  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RemediationService.name);
    this.controller = new RemediationController(
      {
        setPaymentTimeoutActive: (active, timeoutMs) => {
          this.metrics.remediationActive.set(
            { action: REMEDIATION_ACTION_PAYMENT_TIMEOUT },
            active ? 1 : 0,
          );
          this.metrics.remediationPaymentTimeoutMs.set(
            active && timeoutMs !== null ? timeoutMs : 0,
          );
        },
        recordLifecycle: () => {
          // Lifecycle is logged; counters reserved for future if needed.
        },
      },
      (level, event, fields = {}) => {
        const msg = event;
        if (level === 'error') {
          this.logger.error(fields, msg);
        } else if (level === 'warn') {
          this.logger.warn(fields, msg);
        } else {
          this.logger.info(fields, msg);
        }
      },
    );

    // Explicit zero gauges at startup for scrape visibility.
    this.metrics.remediationActive.set(
      { action: REMEDIATION_ACTION_PAYMENT_TIMEOUT },
      0,
    );
    this.metrics.remediationPaymentTimeoutMs.set(0);
  }

  listStates(): PaymentTimeoutStateView[] {
    return this.controller.listStates();
  }

  getPaymentTimeoutState(): PaymentTimeoutStateView {
    return this.controller.getPaymentTimeoutState();
  }

  getActivePaymentTimeoutMs(): number | null {
    return this.controller.getActivePaymentTimeoutMs();
  }

  setPaymentTimeout(timeoutMs: number): SetPaymentTimeoutResult {
    return this.controller.setPaymentTimeout(timeoutMs);
  }

  clearPaymentTimeout(): ClearPaymentTimeoutResult {
    return this.controller.clearPaymentTimeout();
  }
}
