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

  app.enableCors({
    origin: config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .split(','),
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
