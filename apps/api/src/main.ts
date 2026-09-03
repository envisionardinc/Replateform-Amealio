import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/** Application bootstrap (P1.6). No business endpoints — foundation only. */
export async function createApp() {
  // rawBody: true exposes req.rawBody so the Razorpay webhook (P1.7.28) can verify
  // the body HMAC byte-for-byte. Harmless for other routes.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(ConfigService);

  // Global API prefix + URI versioning: routes are served under /api/v1/*
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Request validation infrastructure (strict; strips unknown fields).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS foundation for local development.
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(',') : true, credentials: true });

  // Graceful shutdown (invokes Prisma onModuleDestroy, etc.).
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await createApp();
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(
    `Amealio API foundation listening on http://localhost:${port}/api/v1 (health: /api/v1/health)`,
  );
}

// Only auto-bootstrap when run directly (tests import createApp instead).
if (require.main === module) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal bootstrap error', err);
    process.exit(1);
  });
}
