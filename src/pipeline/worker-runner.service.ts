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
import { LearnProcessor } from './processors/learn.processor';
import { ImportProcessor } from './processors/import.processor';
import { ExtractProcessor } from './processors/extract.processor';
import { OcrProcessor } from './processors/ocr.processor';
import { LectureChapterProcessor } from './processors/lecture-chapter.processor';
import { LectureVoiceProcessor } from './processors/lecture-voice.processor';
import { LectureAlignProcessor } from './processors/lecture-align.processor';
import { LectureDiagramProcessor } from './processors/lecture-diagram.processor';
import { LectureBoardProcessor } from './processors/lecture-board.processor';
import { LectureFollowProcessor } from './processors/lecture-follow.processor';
import { VisualSceneProcessor } from './processors/visual-scene.processor';
import { SimplifyPageProcessor } from './processors/simplify.processor';
import { SummarizeProcessor } from './processors/summarize.processor';
import { TopicsProcessor } from './processors/topics.processor';
import {
  QUEUE,
  QUEUE_SETTINGS,
  type BaseJobData,
  type ExportJobData,
  type LearnJobData,
  type ImportJobData,
  type LectureChapterJobData,
  type LectureVoiceJobData,
  type QueueName,
  type SimplifyJobData,
  LectureAlignJobData,
  LectureDiagramJobData,
  LectureBoardJobData,
  LectureFollowJobData,
  VisualSceneJobData,
} from './queues';

type Handler = (data: never, context: JobContext) => Promise<void>;
/** What a processor does when the queue has given up on one of its jobs. */
type Dropped = (data: never, reason: string) => Promise<void>;

/** Interruptions a job survives before the queue gives up on it: a deploy or two. */
const MAX_STALLED = 3;

/**
 * Whether this failure is the job's last: no attempts left, an error the
 * runner declared unrecoverable, or the queue's own verdict that the job
 * stalled once too often. Anything else is retried and needs no cleanup.
 */
export function isDropped(
  job: { attemptsMade: number } | undefined,
  error: { name?: string; message: string },
  attempts: number,
): boolean {
  if (!job) return true;
  if (error.name === 'UnrecoverableError') return true;
  if (/stalled/i.test(error.message)) return true;
  return job.attemptsMade >= attempts;
}

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
    private readonly ocr: OcrProcessor,
    private readonly summarize: SummarizeProcessor,
    private readonly topics: TopicsProcessor,
    private readonly embed: EmbedProcessor,
    private readonly simplify: SimplifyPageProcessor,
    private readonly lectureChapter: LectureChapterProcessor,
    private readonly lectureVoice: LectureVoiceProcessor,
    private readonly lectureAlign: LectureAlignProcessor,
    private readonly lectureDiagram: LectureDiagramProcessor,
    private readonly lectureBoard: LectureBoardProcessor,
    private readonly lectureFollow: LectureFollowProcessor,
    private readonly visualScene: VisualSceneProcessor,
    private readonly exports: ExportProcessor,
    private readonly learn: LearnProcessor,
    private readonly importer: ImportProcessor,
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
      [QUEUE.ocr]: (data: BaseJobData, ctx) => this.ocr.process(data, ctx),
      [QUEUE.summarize]: (data: BaseJobData, ctx) =>
        this.summarize.process(data, ctx),
      [QUEUE.topics]: (data: BaseJobData, ctx) =>
        this.topics.process(data, ctx),
      [QUEUE.embed]: (data: BaseJobData, ctx) => this.embed.process(data, ctx),
      [QUEUE.simplify]: (data: SimplifyJobData, ctx) =>
        this.simplify.process(data, ctx),
      [QUEUE.export]: (data: ExportJobData, ctx) =>
        this.exports.process(data, ctx),
      [QUEUE.learn]: (data: LearnJobData) => this.learn.process(data),
      [QUEUE.import]: (data: ImportJobData) => this.importer.process(data),
      [QUEUE.lectureChapter]: (data: LectureChapterJobData, ctx) =>
        this.lectureChapter.process(data, ctx),
      [QUEUE.lectureVoice]: (data: LectureVoiceJobData, ctx) =>
        this.lectureVoice.process(data, ctx),
      [QUEUE.lectureAlign]: (data: LectureAlignJobData, ctx) =>
        this.lectureAlign.process(data, ctx),
      [QUEUE.lectureDiagram]: (data: LectureDiagramJobData, ctx) =>
        this.lectureDiagram.process(data, ctx),
      [QUEUE.lectureBoard]: (data: LectureBoardJobData, ctx) =>
        this.lectureBoard.process(data, ctx),
      [QUEUE.lectureFollow]: (data: LectureFollowJobData) =>
        this.lectureFollow.process(data),
      [QUEUE.visualScene]: (data: VisualSceneJobData, ctx) =>
        this.visualScene.process(data, ctx),
    };
    // A chapter job the queue gives up on leaves pages pending for ever
    // unless someone says so; the other queues' rows go stale on their own.
    const dropped: Partial<Record<QueueName, Dropped>> = {
      [QUEUE.lectureChapter]: (data: LectureChapterJobData, reason) =>
        this.lectureChapter.onDropped(data, reason),
    };

    for (const name of Object.values(QUEUE)) {
      this.workers.push(this.startWorker(name, handlers[name], dropped[name]));
    }

    this.logger.log(`Consuming ${this.workers.length} queues`);
  }

  private startWorker(
    name: QueueName,
    handle: Handler,
    onDropped?: Dropped,
  ): Worker {
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
        // A job whose worker was replaced under it, by a deploy, is taken
        // up again; only after this many such interruptions is it dropped.
        maxStalledCount: MAX_STALLED,
      },
    );

    worker.on('failed', (job, error) => {
      this.logger.warn(
        `${name} job ${job?.id ?? '?'} failed: ${error.message}`,
      );
      const attempts = job?.opts.attempts ?? QUEUE_SETTINGS[name].attempts;
      if (onDropped && job && isDropped(job, error, attempts)) {
        onDropped(job.data as never, error.message).catch((cause: unknown) =>
          this.logger.error(
            `${name} job ${job.id ?? '?'}: could not record the drop: ${String(cause)}`,
          ),
        );
      }
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
