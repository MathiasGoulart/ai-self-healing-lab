import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { Order } from '../orders/order.entity';
import { OrderStatus } from '../orders/order-status.enum';

/** Deterministic seed product IDs used in experiments (no product API). */
export const SEED_PRODUCTS = [
  'product-100',
  'product-200',
  'product-300',
] as const;

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SeedService.name);
  }

  async onModuleInit(): Promise<void> {
    if (this.config.get<boolean>('app.seedOnStartup')) {
      await this.seed();
    }
  }

  async seed(): Promise<{ created: number; skipped: boolean }> {
    const existing = await this.ordersRepository.count();
    if (existing > 0) {
      this.logger.info(
        { event: 'seed_skipped', existingOrders: existing },
        'Seed skipped because orders already exist',
      );
      return { created: 0, skipped: true };
    }

    const orders = SEED_PRODUCTS.map((productId, index) =>
      this.ordersRepository.create({
        productId,
        quantity: index + 1,
        status: OrderStatus.PENDING,
        paymentId: null,
      }),
    );

    const saved = await this.ordersRepository.save(orders);
    this.logger.info(
      {
        event: 'seed_completed',
        created: saved.length,
        productIds: SEED_PRODUCTS,
      },
      'Deterministic seed completed',
    );
    return { created: saved.length, skipped: false };
  }
}
