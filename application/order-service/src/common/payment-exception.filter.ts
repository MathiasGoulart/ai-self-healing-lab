import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PaymentError } from '../payments/payment.errors';

@Catch(PaymentError)
export class PaymentExceptionFilter implements ExceptionFilter {
  catch(exception: PaymentError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      error: 'Bad Gateway',
      message: exception.message,
    });
  }
}
