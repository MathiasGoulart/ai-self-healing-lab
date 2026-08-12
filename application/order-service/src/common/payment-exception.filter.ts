import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PaymentError, PaymentTimeoutError } from '../payments/payment.errors';

@Catch(PaymentError)
export class PaymentExceptionFilter implements ExceptionFilter {
  catch(exception: PaymentError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isTimeout = exception instanceof PaymentTimeoutError;
    response.status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      error: 'Bad Gateway',
      message: exception.message,
      ...(isTimeout ? { remediation: 'payment_timeout' } : {}),
    });
  }
}