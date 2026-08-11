/**
 * Fault injection types for Phase 2A.
 * Only F01 (payment_latency) is implemented; additional types can be added later.
 */

export type FaultType = 'payment_latency';

export type FaultSeverity = 'low' | 'medium' | 'high';

/** Protocol-defined severity → delay mapping (F01). Arbitrary delays are rejected. */
export const PAYMENT_LATENCY_MS: Record<FaultSeverity, number> = {
  low: 500,
  medium: 2000,
  high: 5000,
};

export const SUPPORTED_FAULTS: readonly FaultType[] = ['payment_latency'] as const;

export const SUPPORTED_SEVERITIES: readonly FaultSeverity[] = [
  'low',
  'medium',
  'high',
] as const;

export function isFaultType(value: unknown): value is FaultType {
  return value === 'payment_latency';
}

export function isFaultSeverity(value: unknown): value is FaultSeverity {
  return value === 'low' || value === 'medium' || value === 'high';
}

export function latencyMsForSeverity(severity: FaultSeverity): number {
  return PAYMENT_LATENCY_MS[severity];
}

export interface FaultStateView {
  fault: FaultType;
  severity: FaultSeverity | null;
  parameter_ms: number | null;
  active: boolean;
  activated_at: string | null;
}

export type ActivateResult =
  | { status: 'activated'; state: FaultStateView }
  | { status: 'already_active'; state: FaultStateView }
  | { status: 'updated'; state: FaultStateView };

export type DeactivateResult =
  | { status: 'deactivated'; state: FaultStateView }
  | { status: 'not_active'; state: FaultStateView };
