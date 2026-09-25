import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { LectureChapterProcessor } from './pipeline/processors/lecture-chapter.processor';
import { SceneVoiceService } from './business/handlers/admin/scene-voice.service';

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
  // What it can voice Visualize with, for the admin page the API serves.
  await app
    .get(SceneVoiceService)
    .announce()
    .catch((error: Error) =>
      new Logger('Worker').warn(
        `could not say which voices it has: ${error.message}`,
      ),
    );
  // Pages left short by the last run are written again without anyone asking.
  await app
    .get(LectureChapterProcessor)
    .resumeShortPages()
    .catch((error: Error) =>
      new Logger('Worker').warn(
        `could not pick up short pages: ${error.message}`,
      ),
    );
}

void bootstrap();
