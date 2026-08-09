/**
 * FaultInjectionHooks — extension points for Phase 2+.
 * Phase 1 keeps these as no-ops so the happy path stays deterministic.
 *
 * Future phases can override these hooks to inject:
 * - artificial latency
 * - errors / timeouts
 * - intermittent failures
 */
export interface FaultInjectionHooks {
  beforePayment?(input: PaymentInput): Promise<void>;
  afterPayment?(input: PaymentInput, result: PaymentResult): Promise<void>;
  shouldFail?(input: PaymentInput): Promise<boolean | Error | null>;
}

export interface PaymentInput {
  orderId: string;
  productId: string;
  quantity: number;
}

export interface PaymentResult {
  paymentId: string;
  status: 'APPROVED' | 'DECLINED';
}

export const noopFaultHooks: FaultInjectionHooks = {
  async beforePayment(): Promise<void> {
    // Phase 1: no fault injection
  },
  async afterPayment(): Promise<void> {
    // Phase 1: no fault injection
  },
  async shouldFail(): Promise<null> {
    // Phase 1: never fail
    return null;
  },
};
