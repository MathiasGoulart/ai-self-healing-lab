import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://orders:orders@localhost:5432/orders',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3001',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? 'order-service',
  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
  seedOnStartup: (process.env.SEED_ON_STARTUP ?? 'false').toLowerCase() === 'true',
}));
