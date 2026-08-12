import {
  assertTimeoutInBounds,
  ClearPaymentTimeoutResult,
  PaymentTimeoutStateView,
  REMEDIATION_ACTION_PAYMENT_TIMEOUT,
  SetPaymentTimeoutResult,
} from './remediation-types';

export type RemediationLogFn = (
  level: string,
  event: string,
  fields?: Record<string, unknown>,
) => void;

export interface RemediationMetricsSink {
  setPaymentTimeoutActive(active: boolean, timeoutMs: number | null): void;
  recordLifecycle(action: 'activate' | 'deactivate' | 'update', timeoutMs: number | null): void;
}

/**
 * In-process R01 actuator state.
 * Shared by Embedded (direct) and External/ops (via HTTP adapter).
 * Deterministic control — no detection or decision logic.
 */
export class RemediationController {
  private enabled = false;
  private timeoutMs: number | null = null;
  private activatedAt: string | null = null;
  private deactivatedAt: string | null = null;

  constructor(
    private readonly metrics: RemediationMetricsSink,
    private readonly log: RemediationLogFn = () => undefined,
  ) {}

  getPaymentTimeoutState(): PaymentTimeoutStateView {
    return {
      action: REMEDIATION_ACTION_PAYMENT_TIMEOUT,
      enabled: this.enabled,
      timeout_ms: this.enabled ? this.timeoutMs : null,
      activated_at: this.enabled ? this.activatedAt : null,
    };
  }

  listStates(): PaymentTimeoutStateView[] {
    return [this.getPaymentTimeoutState()];
  }

  /**
   * Active timeout in ms, or null when R01 is off.
   * Used by PaymentClient on each charge().
   */
  getActivePaymentTimeoutMs(): number | null {
    if (!this.enabled || this.timeoutMs === null) {
      return null;
    }
    return this.timeoutMs;
  }

  /**
   * Activate or update payment timeout within protocol bounds [Tmin, Tmax].
   */
  setPaymentTimeout(timeoutMs: number): SetPaymentTimeoutResult {
    assertTimeoutInBounds(timeoutMs);

    if (this.enabled && this.timeoutMs === timeoutMs) {
      return { status: 'already_active', state: this.getPaymentTimeoutState() };
    }

    const updating = this.enabled && this.timeoutMs !== timeoutMs;
    const previousTimeoutMs = this.timeoutMs;

    this.enabled = true;
    this.timeoutMs = timeoutMs;
    if (!updating || !this.activatedAt) {
      this.activatedAt = new Date().toISOString();
    }
    this.deactivatedAt = null;

    this.metrics.setPaymentTimeoutActive(true, timeoutMs);
    this.metrics.recordLifecycle(updating ? 'update' : 'activate', timeoutMs);

    this.log('info', 'remediation', {
      action: updating ? 'update' : 'activate',
      remediation: REMEDIATION_ACTION_PAYMENT_TIMEOUT,
      timeout_ms: timeoutMs,
      timestamp: new Date().toISOString(),
      activated_at: this.activatedAt,
      ...(updating ? { previous_timeout_ms: previousTimeoutMs } : {}),
    });

    return {
      status: updating ? 'updated' : 'activated',
      state: this.getPaymentTimeoutState(),
    };
  }

  clearPaymentTimeout(): ClearPaymentTimeoutResult {
    if (!this.enabled || this.timeoutMs === null) {
      return { status: 'not_active', state: this.getPaymentTimeoutState() };
    }

    const previousTimeoutMs = this.timeoutMs;
    this.deactivatedAt = new Date().toISOString();

    this.metrics.setPaymentTimeoutActive(false, null);
    this.metrics.recordLifecycle('deactivate', previousTimeoutMs);

    this.log('info', 'remediation', {
      action: 'deactivate',
      remediation: REMEDIATION_ACTION_PAYMENT_TIMEOUT,
      timeout_ms: previousTimeoutMs,
      timestamp: this.deactivatedAt,
      activated_at: this.activatedAt,
    });

    this.enabled = false;
    this.timeoutMs = null;
    this.activatedAt = null;

    return { status: 'deactivated', state: this.getPaymentTimeoutState() };
  }

  getLastDeactivatedAt(): string | null {
    return this.deactivatedAt;
  }
}
