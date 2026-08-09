export class PaymentError extends Error {
  readonly statusCode = 502;

  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}
