import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  imports: [DatabaseModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class TelemetryModule {}
