import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { TMAX_MS, TMIN_MS } from '../remediation-types';

export class SetPaymentTimeoutDto {
  @ApiProperty({
    description: 'When false, clears the payment timeout (same as DELETE)',
    example: true,
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: `Required when enabled=true. Must be in [${TMIN_MS}, ${TMAX_MS}]`,
    example: 300,
    minimum: TMIN_MS,
    maximum: TMAX_MS,
  })
  @ValidateIf((o: SetPaymentTimeoutDto) => o.enabled === true)
  @IsInt()
  @Min(TMIN_MS)
  @Max(TMAX_MS)
  timeout_ms?: number;
}
