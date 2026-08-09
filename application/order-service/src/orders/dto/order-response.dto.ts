import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../order-status.enum';
import { Order } from '../order.entity';

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'product-123' })
  productId!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiPropertyOptional({ nullable: true })
  paymentId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(order: Order): OrderResponseDto {
    return {
      id: order.id,
      productId: order.productId,
      quantity: order.quantity,
      status: order.status,
      paymentId: order.paymentId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
