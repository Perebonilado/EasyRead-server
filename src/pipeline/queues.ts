import type { Level, PipelineStep } from '../contracts';

/**
 * One queue per job type, so each gets its own concurrency and rate limit —
 * `simplify` is the throughput knob (technical design §4.1).
 */
export const QUEUE = {
  convert: 'convert',
  extract: 'extract',
  summarize: 'summarize',
  topics: 'topics',
  embed: 'embed',
  simplify: 'simplify',
  export: 'export',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/** Per-queue concurrency and retry policy, straight from §4.1's table. */
export const QUEUE_SETTINGS: Record<
  QueueName,
  { concurrency: number; attempts: number; backoffMs: number }
> = {
  convert: { concurrency: 4, attempts: 3, backoffMs: 10_000 },
  extract: { concurrency: 4, attempts: 3, backoffMs: 5_000 },
  summarize: { concurrency: 8, attempts: 3, backoffMs: 5_000 },
  topics: { concurrency: 4, attempts: 2, backoffMs: 10_000 },
  embed: { concurrency: 4, attempts: 5, backoffMs: 10_000 },
  simplify: { concurrency: 10, attempts: 3, backoffMs: 8_000 },
  export: { concurrency: 2, attempts: 2, backoffMs: 15_000 },
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
export const simplifyJobId = (documentId: string, level: Level, page: number) =>
  `simplify-${documentId}-${level}-${page}`;

export const stepJobId = (step: PipelineStep, documentId: string) =>
  `${step}-${documentId}`;

export const exportJobId = (exportId: string) => `export-${exportId}`;
