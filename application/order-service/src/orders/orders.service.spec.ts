import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { OrdersService } from './orders.service';
import { Order } from './order.entity';
import { OrderStatus } from './order-status.enum';
import { PaymentClient } from '../payments/payment.client';
import { MetricsService } from '../telemetry/metrics.service';
import { PaymentError } from '../payments/payment.errors';

describe('OrdersService', () => {
  let service: OrdersService;

  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const paymentClient = {
    charge: jest.fn(),
  };

  const metrics = {
    ordersCreated: { inc: jest.fn() },
    ordersProcessedSuccess: { inc: jest.fn() },
    ordersProcessedFailure: { inc: jest.fn() },
    orderProcessingDuration: { startTimer: jest.fn(() => jest.fn()) },
  };

  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: repository },
        { provide: PaymentClient, useValue: paymentClient },
        { provide: MetricsService, useValue: metrics },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  describe('create', () => {
    it('creates a PENDING order for a valid request', async () => {
      const created = {
        id: '11111111-1111-4111-8111-111111111111',
        productId: 'product-123',
        quantity: 2,
        status: OrderStatus.PENDING,
        paymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.create({ productId: 'product-123', quantity: 2 });

      expect(result.status).toBe(OrderStatus.PENDING);
      expect(metrics.ordersCreated.inc).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order_created', orderId: created.id }),
        expect.any(String),
      );
    });

    it('propagates database failures', async () => {
      repository.create.mockReturnValue({ productId: 'product-123', quantity: 1 });
      repository.save.mockRejectedValue(new Error('database unavailable'));

      await expect(
        service.create({ productId: 'product-123', quantity: 1 }),
      ).rejects.toThrow('database unavailable');
    });
  });

  describe('process', () => {
    const pendingOrder: Order = {
      id: '22222222-2222-4222-8222-222222222222',
      productId: 'product-123',
      quantity: 2,
      status: OrderStatus.PENDING,
      paymentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('marks the order PAID on successful payment', async () => {
      repository.findOne.mockResolvedValue({ ...pendingOrder });
      repository.save
        .mockImplementationOnce(async (order: Order) => order)
        .mockImplementationOnce(async (order: Order) => order);
      paymentClient.charge.mockResolvedValue({
        paymentId: 'payment-123',
        status: 'APPROVED',
      });

      const result = await service.process(pendingOrder.id);

      expect(result.status).toBe(OrderStatus.PAID);
      expect(result.paymentId).toBe('payment-123');
      expect(metrics.ordersProcessedSuccess.inc).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order_processing_completed' }),
        expect.any(String),
      );
    });

    it('marks the order FAILED when payment fails', async () => {
      repository.findOne.mockResolvedValue({ ...pendingOrder });
      repository.save.mockImplementation(async (order: Order) => ({ ...order }));
      paymentClient.charge.mockRejectedValue(new PaymentError('payment declined'));

      await expect(service.process(pendingOrder.id)).rejects.toBeInstanceOf(PaymentError);
      expect(metrics.ordersProcessedFailure.inc).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'order_processing_failed' }),
        expect.any(String),
      );
    });

    it('throws NotFoundException when the order does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.process('33333333-3333-4333-8333-333333333333'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects processing when the order is not PENDING', async () => {
      repository.findOne.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.PAID,
      });

      await expect(service.process(pendingOrder.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
