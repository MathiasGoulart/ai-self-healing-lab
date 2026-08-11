import {
  ActivateResult,
  DeactivateResult,
  FaultSeverity,
  FaultStateView,
  FaultType,
  latencyMsForSeverity,
} from './fault-types';

export type FaultLogFn = (
  level: string,
  event: string,
  fields?: Record<string, unknown>,
) => void;

export interface FaultMetricsSink {
  setActive(fault: FaultType, severity: FaultSeverity | null, active: boolean): void;
  recordLifecycle(
    fault: FaultType,
    severity: FaultSeverity,
    action: 'activate' | 'deactivate',
  ): void;
}

/**
 * In-process fault controller.
 * Deterministic external control for experiments — no detection or recovery logic.
 */
export class FaultController {
  private activeFault: FaultType | null = null;
  private severity: FaultSeverity | null = null;
  private activatedAt: string | null = null;
  private deactivatedAt: string | null = null;

  constructor(
    private readonly metrics: FaultMetricsSink,
    private readonly log: FaultLogFn = () => undefined,
  ) {}

  getState(fault: FaultType = 'payment_latency'): FaultStateView {
    const active = this.activeFault === fault;
    return {
      fault,
      severity: active ? this.severity : null,
      parameter_ms:
        active && this.severity ? latencyMsForSeverity(this.severity) : null,
      active,
      activated_at: active ? this.activatedAt : null,
    };
  }

  listStates(): FaultStateView[] {
    return [this.getState('payment_latency')];
  }

  /**
   * Activate or update payment_latency.
   * - Same severity already active → already_active (no duplicate state)
   * - Different severity while active → update in place (no stacked delays)
   */
  activate(fault: FaultType, severity: FaultSeverity): ActivateResult {
    if (fault !== 'payment_latency') {
      throw new Error(`Unsupported fault type: ${fault}`);
    }

    const parameterMs = latencyMsForSeverity(severity);

    if (this.activeFault === fault && this.severity === severity) {
      return { status: 'already_active', state: this.getState(fault) };
    }

    const updating =
      this.activeFault === fault && this.severity !== null && this.severity !== severity;
    const previousSeverity = this.severity;

    if (updating && previousSeverity) {
      this.metrics.setActive(fault, previousSeverity, false);
    }

    this.activeFault = fault;
    this.severity = severity;
    this.activatedAt = new Date().toISOString();
    this.deactivatedAt = null;

    this.metrics.setActive(fault, severity, true);
    this.metrics.recordLifecycle(fault, severity, 'activate');

    this.log('info', 'fault_injection', {
      action: 'activate',
      fault,
      severity,
      parameter_ms: parameterMs,
      timestamp: this.activatedAt,
      ...(updating ? { previous_severity: previousSeverity } : {}),
    });

    return {
      status: updating ? 'updated' : 'activated',
      state: this.getState(fault),
    };
  }

  deactivate(fault: FaultType): DeactivateResult {
    if (fault !== 'payment_latency') {
      throw new Error(`Unsupported fault type: ${fault}`);
    }

    if (this.activeFault !== fault || !this.severity) {
      return { status: 'not_active', state: this.getState(fault) };
    }

    const severity = this.severity;
    const parameterMs = latencyMsForSeverity(severity);
    this.deactivatedAt = new Date().toISOString();

    this.metrics.setActive(fault, severity, false);
    this.metrics.recordLifecycle(fault, severity, 'deactivate');

    this.log('info', 'fault_injection', {
      action: 'deactivate',
      fault,
      severity,
      parameter_ms: parameterMs,
      timestamp: this.deactivatedAt,
      activated_at: this.activatedAt,
    });

    this.activeFault = null;
    this.severity = null;
    this.activatedAt = null;

    return { status: 'deactivated', state: this.getState(fault) };
  }

  /** Async delay applied per payment request when F01 is active. */
  getPaymentLatencyMs(): number {
    if (this.activeFault !== 'payment_latency' || !this.severity) {
      return 0;
    }
    return latencyMsForSeverity(this.severity);
  }

  /** Last deactivation timestamp (for experiment artifacts / debugging). */
  getLastDeactivatedAt(): string | null {
    return this.deactivatedAt;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
