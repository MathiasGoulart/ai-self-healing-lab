import { Module } from '@nestjs/common';
import { PaymentClient } from './payment.client';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [TelemetryModule],
  providers: [PaymentClient],
  exports: [PaymentClient],
})
export class PaymentsModule {}
