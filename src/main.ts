import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, raw, urlencoded } from 'express';
import { AppModule } from './app.module';
import { MAX_UPLOAD_BYTES } from './business/domain/values';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // The upload endpoint reads the raw stream itself; the JSON parser must not
  // consume it first.
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.use(
    '/api/v1/documents/:id/content',
    raw({ type: '*/*', limit: MAX_UPLOAD_BYTES }),
  );
  // Voice recordings for guided reading arrive as raw audio bytes too. The
  // cap is generous for ~3 minutes of webm/opus; anything bigger is not a
  // recall recording.
  app.use(
    '/api/v1/documents/:id/transcribe',
    raw({ type: '*/*', limit: '16mb' }),
  );
  // The billing webhook's signature is taken over the exact bytes the
  // gateway sent. Parsing to JSON and re-serialising changes them, so every
  // webhook would fail verification; this path keeps the raw buffer.
  app.use('/api/v1/billing/webhook', raw({ type: '*/*', limit: '1mb' }));

  const allowedOrigins = config
    .get<string>('FRONTEND_URL', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isProduction = config.get('NODE_ENV') === 'production';
  /**
   * A phone testing over wifi loads the app from this machine's LAN address,
   * not from localhost, so in development any private-network origin is
   * allowed as well. Production stays on the configured list.
   */
  const PRIVATE_HOST =
    /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
  const allowPrivateOrigin = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    try {
      callback(null, PRIVATE_HOST.test(new URL(origin).hostname));
    } catch {
      callback(null, false);
    }
  };
  app.enableCors({
    origin: isProduction ? allowedOrigins : allowPrivateOrigin,
    // Required for the refresh cookie to travel.
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT', '4000'));
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on ${port}`);
}

void bootstrap();
