/**
 * FaultInjectionHooks — extension points for Phase 2+.
 *
 * Phase 2A implements F01 (payment latency) via FaultController → beforePayment.
 * Additional fault types can override shouldFail / afterPayment later.
 */

export interface PaymentInput {
  orderId: string;
  productId: string;
  quantity: number;
}

export interface PaymentResult {
  paymentId: string;
  status: 'APPROVED';
}

export interface FaultInjectionHooks {
  beforePayment?(input: PaymentInput): Promise<void>;
  afterPayment?(input: PaymentInput, result: PaymentResult): Promise<void>;
  shouldFail?(input: PaymentInput): Promise<boolean | Error | null>;
}

export const noopFaultHooks: FaultInjectionHooks = {
  async beforePayment(): Promise<void> {
    // no fault injection
  },
  async afterPayment(): Promise<void> {
    // no fault injection
  },
  async shouldFail(): Promise<null> {
    return null;
  },
};
