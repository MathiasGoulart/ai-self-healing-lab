export class PaymentError extends Error {
  readonly statusCode = 502;

  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

/** Thrown when R01 AbortSignal timeout aborts the payment dependency call. */
export class PaymentTimeoutError extends PaymentError {
  constructor(timeoutMs: number) {
    super(`Payment request timed out after ${timeoutMs}ms (R01)`);
    this.name = 'PaymentTimeoutError';
  }
}
