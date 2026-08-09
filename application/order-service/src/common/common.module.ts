import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { context, trace } from '@opentelemetry/api';
import { RequestIdMiddleware } from './request-id.middleware';
import { PaymentExceptionFilter } from './payment-exception.filter';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('app.logLevel', 'info');
        return {
          pinoHttp: {
            level,
            genReqId: (req, res) => {
              const existing = req.headers['x-request-id'];
              const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            customProps: () => {
              const span = trace.getSpan(context.active());
              const spanContext = span?.spanContext();
              return {
                service: 'order-service',
                traceId: spanContext?.traceId,
                spanId: spanContext?.spanId,
              };
            },
            serializers: {
              req: (req) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res) => ({
                statusCode: res.statusCode,
              }),
            },
            transport:
              process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY === 'true'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            formatters: {
              level: (label) => ({ level: label }),
            },
            timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
            messageKey: 'message',
            quietReqLogger: true,
          },
        };
      },
    }),
  ],
  providers: [
    RequestIdMiddleware,
    {
      provide: APP_FILTER,
      useClass: PaymentExceptionFilter,
    },
  ],
  exports: [LoggerModule, RequestIdMiddleware],
})
export class CommonModule {}
