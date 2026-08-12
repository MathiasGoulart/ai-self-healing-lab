import { Module } from '@nestjs/common';
import { PaymentClient } from './payment.client';
import { RemediationModule } from '../remediation/remediation.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [TelemetryModule, RemediationModule],
  providers: [PaymentClient],
  exports: [PaymentClient],
})
export class PaymentsModule {}
