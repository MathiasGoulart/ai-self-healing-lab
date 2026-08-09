export interface PaymentRequest {
  orderId: string;
  productId: string;
  quantity: number;
}

export interface PaymentResponse {
  paymentId: string;
  status: 'APPROVED' | 'DECLINED';
}
