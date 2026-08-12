/**
 * R01 — Runtime Dependency Timeout (protocol freeze).
 *
 * E002/E003 always pass E002_FIXED_TIMEOUT_MS (300).
 * Actuator accepts any timeout_ms in [TMIN_MS, TMAX_MS] for E004 readiness.
 */

export const TMIN_MS = 250;
export const TMAX_MS = 450;
/** Fixed timeout for E002 / E003 — AI must not choose. */
export const E002_FIXED_TIMEOUT_MS = 300;

export const REMEDIATION_ACTION_PAYMENT_TIMEOUT = 'payment_timeout' as const;

export type RemediationAction = typeof REMEDIATION_ACTION_PAYMENT_TIMEOUT;

export interface PaymentTimeoutStateView {
  action: typeof REMEDIATION_ACTION_PAYMENT_TIMEOUT;
  enabled: boolean;
  timeout_ms: number | null;
  activated_at: string | null;
}

export interface RemediationListView {
  remediations: PaymentTimeoutStateView[];
}

export type SetPaymentTimeoutStatus =
  | 'activated'
  | 'updated'
  | 'already_active'
  | 'disabled';

export interface SetPaymentTimeoutResult {
  status: SetPaymentTimeoutStatus;
  state: PaymentTimeoutStateView;
}

export interface ClearPaymentTimeoutResult {
  status: 'deactivated' | 'not_active';
  state: PaymentTimeoutStateView;
}

export class RemediationBoundsError extends Error {
  readonly statusCode = 400;

  constructor(timeoutMs: number) {
    super(
      `timeout_ms must be between ${TMIN_MS} and ${TMAX_MS} (inclusive); got ${timeoutMs}`,
    );
    this.name = 'RemediationBoundsError';
  }
}

export function assertTimeoutInBounds(timeoutMs: number): void {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < TMIN_MS ||
    timeoutMs > TMAX_MS
  ) {
    throw new RemediationBoundsError(timeoutMs);
  }
}
