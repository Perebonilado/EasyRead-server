/**
 * Films made into video files (studio-export) by this process alone,
 * without the rest of the worker:
 *
 *   npm run studio:export -- --worker       consume the studio-export queue, one video at a time
 *   npm run studio:export -- <exportId>     make one video now, in this process
 *   npm run studio:export -- --episode <id> --user <id> [--shape tall] [--show] [--no-captions]
 *                                           ask for a video as the maker's Download does,
 *                                           and make it now, in this process
 *
 * The whole worker sweeps the database as it boots (purges, lost pages
 * queued again, short pages written again); this runs nothing but the
 * export, so a video can be tried against a shared database, and so
 * videos can be made on a service of their own, the one with Chrome and
 * ffmpeg, while the main worker goes without them.
 *
 * It reads the same environment as the worker: REDIS_URL, DATABASE_URL,
 * STORAGE_*, RENDER_WEB_URL, CHROME_PATH, FFMPEG_PATH, EXPORT_FPS,
 * EXPORT_PAGES, and STUDIO_EXPORT_SECRET (or JWT_ACCESS_SECRET).
 */
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { CoreModule } from '../src/core.module';
import { StudioExportProcessor } from '../src/pipeline/processors/studio-export.processor';
import { StudioExportService } from '../src/business/handlers/studio/studio-export.service';
import {
  QUEUE,
  QUEUE_SETTINGS,
  type StudioExportJobData,
} from '../src/pipeline/queues';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [StudioExportProcessor, StudioExportService],
})
class ExportModule {}

async function main(): Promise<void> {
  const logger = new Logger('studio:export');
  const app = await NestFactory.createApplicationContext(ExportModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();
  const processor = app.get(StudioExportProcessor);
  const flag = (name: string) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? (process.argv[at + 1] ?? null) : null;
  };

  // A video asked for as the maker's Download asks, then made here.
  const episodeId = flag('--episode');
  if (episodeId) {
    const userId = flag('--user');
    if (!userId) throw new Error('--episode needs --user, the maker');
    const asked = await app
      .get(StudioExportService)
      .request(userId, episodeId, {
        scope: process.argv.includes('--show') ? 'show' : 'episode',
        shape: flag('--shape') === 'tall' ? 'tall' : 'wide',
        captions: !process.argv.includes('--no-captions'),
      });
    logger.log(
      `${asked.id}: ${asked.status}${asked.url ? ` ${asked.url}` : ''}`,
    );
    if (asked.status !== 'done')
      await processor.process(
        { exportId: asked.id },
        { attemptsMade: 1, isFinalAttempt: true },
      );
    const done = await app.get(StudioExportService).get(userId, asked.id);
    logger.log(
      `${done.id}: ${done.status} ${done.bytes ?? 0} bytes ${done.url ?? ''}`,
    );
    await app.close();
    return;
  }

  const [asked] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

  if (!process.argv.includes('--worker')) {
    if (!asked) throw new Error('Name an export id, or pass --worker');
    await processor.process(
      { exportId: asked },
      { attemptsMade: 1, isFinalAttempt: true },
    );
    logger.log(`${asked}: done`);
    await app.close();
    return;
  }

  const connection = new Redis(
    app.get(ConfigService).get<string>('REDIS_URL', 'redis://localhost:6380'),
    { maxRetriesPerRequest: null },
  );
  const settings = QUEUE_SETTINGS[QUEUE.studioExport];
  const worker = new Worker<StudioExportJobData>(
    QUEUE.studioExport,
    async (job) => {
      const attempts = job.opts.attempts ?? settings.attempts;
      await processor.process(job.data, {
        attemptsMade: job.attemptsMade + 1,
        isFinalAttempt: job.attemptsMade + 1 >= attempts,
        jobId: job.id,
      });
    },
    { connection, concurrency: settings.concurrency, maxStalledCount: 3 },
  );
  worker.on('failed', (job, error) =>
    logger.warn(`${job?.id ?? '?'} failed: ${error.message}`),
  );
  worker.on('completed', (job) => logger.log(`${job.id} done`));
  logger.log(`Consuming ${QUEUE.studioExport}`);
  const stop = async () => {
    await worker.close();
    await connection.quit();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
