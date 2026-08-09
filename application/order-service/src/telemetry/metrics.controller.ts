import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.getContentType());
    res.send(await this.metrics.getMetrics());
  }
}
