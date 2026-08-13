import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * The pipeline worker. No HTTP server — it only consumes queues, so it can be
 * scaled on queue depth without touching the API (§4.1).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Lets BullMQ finish in-flight jobs on SIGTERM instead of dropping them back
  // to the queue as stalled.
  app.enableShutdownHooks();
  new Logger('Worker').log('Pipeline worker started');
}

void bootstrap();
