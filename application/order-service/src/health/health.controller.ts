import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'Process is alive' })
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (PostgreSQL + Payment Service)' })
  @ApiOkResponse({ description: 'Dependencies are ready' })
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        const baseUrl = this.config.get<string>('app.paymentServiceUrl', 'http://localhost:3001');
        const response = await fetch(`${baseUrl}/health/ready`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) {
          throw new Error(`Payment service health returned ${response.status}`);
        }
        return {
          payment: {
            status: 'up' as const,
          },
        };
      },
    ]);
  }
}
