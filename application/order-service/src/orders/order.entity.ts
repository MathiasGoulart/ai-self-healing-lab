import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from './order-status.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'product_id', type: 'varchar', length: 128 })
  productId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'varchar', length: 32, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column({ name: 'payment_id', type: 'varchar', length: 128, nullable: true })
  paymentId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
