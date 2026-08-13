import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  isPermanentFailure,
  type JobContext,
} from './processors/base.processor';
import { ConvertProcessor } from './processors/convert.processor';
import { EmbedProcessor } from './processors/embed.processor';
import { ExportProcessor } from './processors/export.processor';
import { ExtractProcessor } from './processors/extract.processor';
import { SimplifyPageProcessor } from './processors/simplify.processor';
import { SummarizeProcessor } from './processors/summarize.processor';
import { TopicsProcessor } from './processors/topics.processor';
import {
  QUEUE,
  QUEUE_SETTINGS,
  type BaseJobData,
  type ExportJobData,
  type QueueName,
  type SimplifyJobData,
} from './queues';

type Handler = (data: never, context: JobContext) => Promise<void>;

/**
 * Binds each queue to its processor and owns the BullMQ workers.
 *
 * Only the worker process boots this — the API enqueues but never consumes, so
 * a slow model call can't occupy a request thread (§4.1).
 */
@Injectable()
export class WorkerRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRunner.name);
  private readonly workers: Worker[] = [];
  private connection!: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly convert: ConvertProcessor,
    private readonly extract: ExtractProcessor,
    private readonly summarize: SummarizeProcessor,
    private readonly topics: TopicsProcessor,
    private readonly embed: EmbedProcessor,
    private readonly simplify: SimplifyPageProcessor,
    private readonly exports: ExportProcessor,
  ) {}

  onModuleInit(): void {
    this.connection = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6380'),
      // BullMQ blocks on Redis commands; capping retries would kill workers.
      { maxRetriesPerRequest: null },
    );

    const handlers: Record<QueueName, Handler> = {
      [QUEUE.convert]: (data: BaseJobData, ctx) =>
        this.convert.process(data, ctx),
      [QUEUE.extract]: (data: BaseJobData, ctx) =>
        this.extract.process(data, ctx),
      [QUEUE.summarize]: (data: BaseJobData, ctx) =>
        this.summarize.process(data, ctx),
      [QUEUE.topics]: (data: BaseJobData, ctx) =>
        this.topics.process(data, ctx),
      [QUEUE.embed]: (data: BaseJobData, ctx) => this.embed.process(data, ctx),
      [QUEUE.simplify]: (data: SimplifyJobData, ctx) =>
        this.simplify.process(data, ctx),
      [QUEUE.export]: (data: ExportJobData, ctx) =>
        this.exports.process(data, ctx),
    };

    for (const name of Object.values(QUEUE)) {
      this.workers.push(this.startWorker(name, handlers[name]));
    }

    this.logger.log(`Consuming ${this.workers.length} queues`);
  }

  private startWorker(name: QueueName, handle: Handler): Worker {
    const worker = new Worker(
      name,
      async (job: Job) => {
        const attempts = job.opts.attempts ?? QUEUE_SETTINGS[name].attempts;
        // `attemptsMade` counts the attempts *before* this one.
        const context: JobContext = {
          attemptsMade: job.attemptsMade + 1,
          isFinalAttempt: job.attemptsMade + 1 >= attempts,
        };
        try {
          await handle(job.data as never, context);
        } catch (error) {
          // The processors stay queue-agnostic; translating "this can never
          // succeed" into BullMQ's vocabulary is the runner's job.
          if (isPermanentFailure(error)) {
            throw new UnrecoverableError((error as Error).message);
          }
          throw error;
        }
      },
      {
        connection: this.connection,
        concurrency: QUEUE_SETTINGS[name].concurrency,
      },
    );

    worker.on('failed', (job, error) => {
      this.logger.warn(
        `${name} job ${job?.id ?? '?'} failed: ${error.message}`,
      );
    });
    worker.on('error', (error) =>
      this.logger.error(`${name} worker error: ${error.message}`),
    );

    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    // Close workers before the connection so in-flight jobs finish cleanly and
    // are not left stuck as active.
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
    await this.connection?.quit();
  }
}
