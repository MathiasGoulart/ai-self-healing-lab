import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './order.entity';
import { OrderStatus } from './order-status.enum';
import { PaymentClient } from '../payments/payment.client';
import { MetricsService } from '../telemetry/metrics.service';
import { PaymentError } from '../payments/payment.errors';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly paymentClient: PaymentClient,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrdersService.name);
  }

  async create(dto: CreateOrderDto): Promise<Order> {
    const order = this.ordersRepository.create({
      productId: dto.productId,
      quantity: dto.quantity,
      status: OrderStatus.PENDING,
      paymentId: null,
    });

    const saved = await this.ordersRepository.save(order);
    this.metrics.ordersCreated.inc();
    this.logger.info(
      {
        event: 'order_created',
        orderId: saved.id,
        productId: saved.productId,
        quantity: saved.quantity,
        status: saved.status,
      },
      'Order created',
    );
    return saved;
  }

  async findById(id: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async process(id: string): Promise<Order> {
    const endTimer = this.metrics.orderProcessingDuration.startTimer();

    try {
      const order = await this.findById(id);

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          `Order ${id} cannot be processed from status ${order.status}`,
        );
      }

      order.status = OrderStatus.PROCESSING;
      await this.ordersRepository.save(order);

      this.logger.info(
        {
          event: 'order_processing_started',
          orderId: order.id,
          productId: order.productId,
          quantity: order.quantity,
        },
        'Order processing started',
      );

      try {
        this.logger.info(
          {
            event: 'payment_started',
            orderId: order.id,
            amount: order.quantity,
          },
          'Payment started',
        );

        const payment = await this.paymentClient.charge({
          orderId: order.id,
          productId: order.productId,
          quantity: order.quantity,
        });

        this.logger.info(
          {
            event: 'payment_completed',
            orderId: order.id,
            paymentId: payment.paymentId,
            paymentStatus: payment.status,
          },
          'Payment completed',
        );

        order.status = OrderStatus.PAID;
        order.paymentId = payment.paymentId;
        const paid = await this.ordersRepository.save(order);

        this.metrics.ordersProcessedSuccess.inc();
        this.logger.info(
          {
            event: 'order_processing_completed',
            orderId: paid.id,
            paymentId: paid.paymentId,
            status: paid.status,
          },
          'Order processing completed',
        );

        return paid;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown payment error';

        this.logger.error(
          {
            event: 'payment_failed',
            orderId: order.id,
            error: message,
          },
          'Payment failed',
        );

        order.status = OrderStatus.FAILED;
        const failed = await this.ordersRepository.save(order);

        this.metrics.ordersProcessedFailure.inc();
        this.logger.error(
          {
            event: 'order_processing_failed',
            orderId: failed.id,
            status: failed.status,
            error: message,
          },
          'Order processing failed',
        );

        if (error instanceof PaymentError) {
          throw error;
        }
        throw new PaymentError(message);
      }
    } finally {
      endTimer();
    }
  }
}
