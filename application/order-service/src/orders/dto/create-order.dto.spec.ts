import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto';

describe('CreateOrderDto', () => {
  it('accepts a valid request', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      productId: 'product-123',
      quantity: 2,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid request', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      productId: '',
      quantity: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
