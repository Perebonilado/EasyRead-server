import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { Level, PipelineStep } from '../../contracts';
import type {
  ExportJob,
  JobQueuePort,
  PipelineJob,
  SimplifyJob,
} from '../../business/ports/job-queue.port';
import {
  QUEUE,
  QUEUE_SETTINGS,
  exportJobId,
  simplifyJobId,
  stepJobId,
  type QueueName,
} from '../../pipeline/queues';

/** Which queue serves each pipeline step. */
const QUEUE_FOR_STEP: Record<Exclude<PipelineStep, 'export'>, QueueName> = {
  convert: QUEUE.convert,
  extract: QUEUE.extract,
  summarize: QUEUE.summarize,
  topics: QUEUE.topics,
  embed: QUEUE.embed,
  simplify_standard: QUEUE.simplify,
  simplify_easiest: QUEUE.simplify,
};

@Injectable()
export class BullmqQueueAdapter implements JobQueuePort, OnModuleDestroy {
  private readonly logger = new Logger(BullmqQueueAdapter.name);
  private readonly connection: Redis;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(config: ConfigService) {
    this.connection = new Redis(
      config.get<string>('REDIS_URL', 'redis://localhost:6380'),
      {
        maxRetriesPerRequest: null,
      },
    );
  }

  private queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  private options(name: QueueName) {
    const settings = QUEUE_SETTINGS[name];
    return {
      attempts: settings.attempts,
      backoff: { type: 'exponential' as const, delay: settings.backoffMs },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86_400 },
    };
  }

  async enqueueStep(
    step: Exclude<PipelineStep, 'export'>,
    job: PipelineJob,
  ): Promise<void> {
    const name = QUEUE_FOR_STEP[step];
    await this.queue(name).add(step, job, {
      ...this.options(name),
      jobId: stepJobId(step, job.documentId, job.contentVersion),
    });
  }

  /**
   * Priority = page number, so page 1 is always written first and the reader
   * sees content at the top of the document while the tail is still running
   * (§4.6). BullMQ treats lower numbers as higher priority.
   */
  async enqueueSimplifyPages(jobs: SimplifyJob[]): Promise<void> {
    if (!jobs.length) return;
    const queue = this.queue(QUEUE.simplify);
    await queue.addBulk(
      jobs.map((job) => ({
        name: 'simplify',
        data: job,
        opts: {
          ...this.options(QUEUE.simplify),
          jobId: simplifyJobId(
            job.documentId,
            job.level,
            job.pageNumber,
            job.contentVersion,
          ),
          priority: Math.min(job.pageNumber, 2_000_000),
        },
      })),
    );
  }

  async enqueueLearn(job: PipelineJob): Promise<void> {
    await this.queue(QUEUE.learn).add('learn', job, {
      ...this.options(QUEUE.learn),
      jobId: `learn-${job.documentId}-${job.contentVersion}`,
    });
  }

  async enqueueExport(job: ExportJob): Promise<void> {
    await this.queue(QUEUE.export).add('export', job, {
      ...this.options(QUEUE.export),
      jobId: exportJobId(job.exportId),
    });
  }

  /**
   * Bumps pages N..N+3 to the front when the reader arrives at an unwritten
   * page. A job that's already running can't be reprioritised — that's fine,
   * it's about to finish anyway (§4.6).
   */
  async prioritise({
    documentId,
    contentVersion,
    level,
    fromPage,
    toPage,
  }: {
    documentId: string;
    contentVersion: number;
    level: Level;
    fromPage: number;
    toPage: number;
  }): Promise<void> {
    const queue = this.queue(QUEUE.simplify);
    for (let page = fromPage; page <= toPage; page++) {
      const job = await queue.getJob(
        simplifyJobId(documentId, level, page, contentVersion),
      );
      if (!job) continue;
      try {
        await job.changePriority({ priority: 1 });
      } catch {
        // Already active or completed — nothing to raise.
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      [...this.queues.values()].map((queue) => queue.close()),
    );
    await this.connection.quit();
  }
}
