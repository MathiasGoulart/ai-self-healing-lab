import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { RemediationHttpController } from './remediation.http.controller';
import { RemediationService } from './remediation.service';

@Module({
  imports: [TelemetryModule],
  controllers: [RemediationHttpController],
  providers: [RemediationService],
  exports: [RemediationService],
})
export class RemediationModule {}
