import type { Level, PipelineStep } from '../contracts';
import type { LectureStyle } from '../contracts';

/**
 * One queue per job type, so each gets its own concurrency and rate limit —
 * `simplify` is the throughput knob (technical design §4.1).
 */
export const QUEUE = {
  convert: 'convert',
  extract: 'extract',
  ocr: 'ocr',
  summarize: 'summarize',
  topics: 'topics',
  embed: 'embed',
  simplify: 'simplify',
  export: 'export',
  learn: 'learn',
  import: 'import',
  lectureChapter: 'lecture-chapter',
  lectureVoice: 'lecture-voice',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/** Per-queue concurrency and retry policy, straight from §4.1's table. */
export const QUEUE_SETTINGS: Record<
  QueueName,
  { concurrency: number; attempts: number; backoffMs: number }
> = {
  convert: { concurrency: 4, attempts: 3, backoffMs: 10_000 },
  extract: { concurrency: 4, attempts: 3, backoffMs: 5_000 },
  // One document at a time; the processor runs its own bounded per-page
  // fan-out of vision calls, so queue concurrency would multiply, not help.
  ocr: { concurrency: 1, attempts: 2, backoffMs: 15_000 },
  summarize: { concurrency: 8, attempts: 3, backoffMs: 5_000 },
  topics: { concurrency: 4, attempts: 2, backoffMs: 10_000 },
  embed: { concurrency: 4, attempts: 5, backoffMs: 10_000 },
  simplify: { concurrency: 10, attempts: 3, backoffMs: 8_000 },
  export: { concurrency: 2, attempts: 2, backoffMs: 15_000 },
  // Writing a document is many minutes of model calls; one retry only,
  // because a second full attempt is expensive and rarely fixes anything.
  learn: { concurrency: 2, attempts: 2, backoffMs: 20_000 },
  // Fetching someone else's website: gentle concurrency, patient retries.
  import: { concurrency: 2, attempts: 2, backoffMs: 20_000 },
  // One job per chapter: plan it, then write its pages IN ORDER, because
  // each page is written knowing the tail of the one before it. Chapters
  // run alongside each other; pages inside one never do.
  'lecture-chapter': { concurrency: 4, attempts: 2, backoffMs: 15_000 },
  // Synthesis needs nothing from its neighbours, so it runs wide and off
  // the writing critical path.
  'lecture-voice': { concurrency: 8, attempts: 3, backoffMs: 10_000 },
};

export interface BaseJobData {
  documentId: string;
  /** A job whose version no longer matches the document exits as skipped. */
  contentVersion: number;
}

export interface SimplifyJobData extends BaseJobData {
  pageNumber: number;
  level: Level;
}

/** Writing a document needs only the document and its version. */
export type LearnJobData = BaseJobData;

/** Fetching an imported document needs the same; the manifest rides on the row. */
export type ImportJobData = BaseJobData;

/** Planning one chapter's lecture and writing its pages in order. */
export interface LectureChapterJobData extends BaseJobData {
  topicId: string;
  /** The chapter's place in the document, so chapter one is written first. */
  orderIndex: number;
  /** Which way of teaching to write; the plan is shared across styles. */
  style: LectureStyle;
  /**
   * Write from this page to the chapter's end first, then the earlier
   * pages: a learner who switched style mid-chapter is waiting here.
   */
  startAtPage?: number;
}

/** Turning one finished script into audio. */
export interface LectureVoiceJobData extends BaseJobData {
  pageNumber: number;
  style: LectureStyle;
}

export interface ExportJobData extends BaseJobData {
  exportId: string;
  level: Level;
}

/**
 * Stable per-page job id gives natural idempotency: enqueuing the same page
 * twice is a no-op in BullMQ rather than a duplicate model call (§4.6).
 *
 * Hyphen-separated, not colon-separated — BullMQ reserves `:` for its own key
 * namespacing and rejects custom ids containing it.
 */
export const simplifyJobId = (
  documentId: string,
  level: Level,
  page: number,
  contentVersion: number,
) => `simplify-${documentId}-v${contentVersion}-${level}-${page}`;

/**
 * The version is part of the identity because the unit of work is a step
 * *on a version of the document*, not on the document forever.
 *
 * Without it, rewriting a document is silently a no-op: BullMQ keeps
 * completed jobs for an hour and ignores a re-added id, so every step of the
 * new version is dropped and the document sits in `processing` with nothing
 * running.
 */
export const stepJobId = (
  step: PipelineStep,
  documentId: string,
  contentVersion: number,
) => `${step}-${documentId}-v${contentVersion}`;

export const exportJobId = (exportId: string) => `export-${exportId}`;

export const importJobId = (documentId: string, contentVersion: number) =>
  `import-${documentId}-v${contentVersion}`;

/** Stable ids, so re-running the fan-out is a no-op rather than a rewrite. */
export const lectureChapterJobId = (
  documentId: string,
  topicId: string,
  contentVersion: number,
  style: LectureStyle,
) => `lecture-chapter-${documentId}-v${contentVersion}-${topicId}-${style}`;

export const lectureVoiceJobId = (
  documentId: string,
  page: number,
  contentVersion: number,
  style: LectureStyle,
) => `lecture-voice-${documentId}-v${contentVersion}-${page}-${style}`;
