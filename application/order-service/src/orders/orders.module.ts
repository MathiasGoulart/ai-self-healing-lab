import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsModule } from '../payments/payments.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), PaymentsModule, TelemetryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
