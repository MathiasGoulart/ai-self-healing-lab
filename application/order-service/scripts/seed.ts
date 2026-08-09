/**
 * Deterministic seed entrypoint.
 *
 * Usage (with DATABASE_URL pointing at a running Postgres):
 *   npm run seed
 *
 * Or enable automatic seeding via SEED_ON_STARTUP=true.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/database/seed.service';
import { startTelemetry } from '../src/telemetry/otel';

async function main(): Promise<void> {
  process.env.SEED_ON_STARTUP = 'false';
  await startTelemetry();
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const seed = app.get(SeedService);
  const result = await seed.seed();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: 'seed_cli_completed', ...result }));
  await app.close();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
