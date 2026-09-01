import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { Level, PipelineStep } from '../../contracts';
import type {
  ExportJob,
  LectureChapterJob,
  LectureVoiceJob,
  JobQueuePort,
  PipelineJob,
  SimplifyJob,
} from '../../business/ports/job-queue.port';
import {
  importJobId,
  QUEUE,
  QUEUE_SETTINGS,
  exportJobId,
  lectureChapterJobId,
  lectureVoiceJobId,
  simplifyJobId,
  stepJobId,
  type QueueName,
} from '../../pipeline/queues';

/** Which queue serves each pipeline step. */
const QUEUE_FOR_STEP: Record<Exclude<PipelineStep, 'export'>, QueueName> = {
  convert: QUEUE.convert,
  extract: QUEUE.extract,
  ocr: QUEUE.ocr,
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
    // Completed job ids linger for an hour and silently swallow a re-add
    // (same trap as enqueueExport). Without this, retrying a page that
    // simplified within the hour resets the row to pending and then nothing
    // ever runs. Done pages that get re-added are fine — the processor's
    // per-page guard drops them on one DB read. Remove throws only for a
    // currently-running job, which is exactly when dropping would be wrong.
    await Promise.all(
      jobs.map((job) =>
        queue
          .remove(
            simplifyJobId(
              job.documentId,
              job.level,
              job.pageNumber,
              job.contentVersion,
            ),
          )
          .catch(() => undefined),
      ),
    );
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

  async enqueueLectureChapters(jobs: LectureChapterJob[]): Promise<void> {
    if (!jobs.length) return;
    const queue = this.queue(QUEUE.lectureChapter);

    // A chapter asked for again is run again, and only its unwritten pages
    // get written: that is how a page that failed gets another chance. A
    // finished job of the same id would otherwise swallow the request as a
    // duplicate. A job still running cannot be removed, and the add below
    // then dedupes against it, which is exactly right.
    await Promise.all(
      jobs.map((job) =>
        queue
          .remove(
            lectureChapterJobId(
              job.documentId,
              job.topicId,
              job.contentVersion,
            ),
          )
          .catch(() => undefined),
      ),
    );

    await queue.addBulk(
      jobs.map((job) => ({
        name: 'lecture-chapter',
        data: job,
        opts: {
          ...this.options(QUEUE.lectureChapter),
          jobId: lectureChapterJobId(
            job.documentId,
            job.topicId,
            job.contentVersion,
          ),
          // Lower is sooner in BullMQ, and zero means "no priority at
          // all" — hence the offset. Chapter one is written first so the
          // student can start listening while the rest is still coming.
          priority: Math.min(job.orderIndex + 1, 2_000_000),
        },
      })),
    );
  }

  async enqueueLectureVoices(jobs: LectureVoiceJob[]): Promise<void> {
    if (!jobs.length) return;
    const queue = this.queue(QUEUE.lectureVoice);

    // Same as the chapters: a page written again must be voiced again, and
    // the finished job of the same id kept for an hour would otherwise
    // swallow the request as a duplicate, leaving the page in `voicing`.
    await Promise.all(
      jobs.map((job) =>
        queue
          .remove(
            lectureVoiceJobId(
              job.documentId,
              job.pageNumber,
              job.contentVersion,
            ),
          )
          .catch(() => undefined),
      ),
    );

    await queue.addBulk(
      jobs.map((job) => ({
        name: 'lecture-voice',
        data: job,
        opts: {
          ...this.options(QUEUE.lectureVoice),
          jobId: lectureVoiceJobId(
            job.documentId,
            job.pageNumber,
            job.contentVersion,
          ),
          // The front of the document is voiced first, for the same reason.
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

  async enqueueImport(job: PipelineJob): Promise<void> {
    await this.queue(QUEUE.import).add('import', job, {
      ...this.options(QUEUE.import),
      jobId: importJobId(job.documentId, job.contentVersion),
    });
  }

  /**
   * An export can legitimately be asked for twice: the document is unchanged
   * and cached, but the reader has written notes since, and those print in
   * the appendix. Completed job ids are retained for an hour and BullMQ
   * silently ignores an `add` that reuses one — so the old job is dropped
   * first, otherwise the re-render never runs and the reader downloads the
   * previous PDF believing it is current.
   */
  async enqueueExport(job: ExportJob): Promise<void> {
    const queue = this.queue(QUEUE.export);
    const jobId = exportJobId(job.exportId);
    // Throws if the job is currently running, which is the one case where
    // dropping it would be wrong anyway — that render is already underway.
    await queue.remove(jobId).catch(() => undefined);
    await queue.add('export', job, {
      ...this.options(QUEUE.export),
      jobId,
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
