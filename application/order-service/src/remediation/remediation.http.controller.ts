import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SetPaymentTimeoutDto } from './dto/set-payment-timeout.dto';
import { RemediationService } from './remediation.service';
import { RemediationBoundsError } from './remediation-types';

/**
 * HTTP adapter for External Agent and operator control.
 * ClusterIP / port-forward only — must not be published via Ingress.
 *
 * Embedded AI must use RemediationService in-process, not this HTTP API.
 */
@ApiTags('remediation')
@Controller('remediation')
export class RemediationHttpController {
  constructor(private readonly remediation: RemediationService) {}

  @Get()
  @ApiOperation({ summary: 'List remediation actuator states (R01)' })
  list() {
    return { remediations: this.remediation.listStates() };
  }

  @Post('payment_timeout')
  @ApiOperation({
    summary: 'Activate or update R01 payment timeout (or disable when enabled=false)',
  })
  setPaymentTimeout(@Body() body: SetPaymentTimeoutDto) {
    if (!body.enabled) {
      const result = this.remediation.clearPaymentTimeout();
      return { status: result.status === 'deactivated' ? 'disabled' : result.status, state: result.state };
    }

    if (body.timeout_ms === undefined) {
      throw new BadRequestException('timeout_ms is required when enabled=true');
    }

    try {
      const result = this.remediation.setPaymentTimeout(body.timeout_ms);
      return { status: result.status, state: result.state };
    } catch (error) {
      if (error instanceof RemediationBoundsError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete('payment_timeout')
  @ApiOperation({ summary: 'Clear R01 payment timeout' })
  clearPaymentTimeout() {
    const result = this.remediation.clearPaymentTimeout();
    return { status: result.status, state: result.state };
  }
}
