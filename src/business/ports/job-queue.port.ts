import type { Level, PipelineStep } from '../../contracts';
import type { LectureStyle, SegmentKind } from '../../contracts';

export interface PipelineJob {
  documentId: string;
  contentVersion: number;
}

export interface SimplifyJob extends PipelineJob {
  pageNumber: number;
  level: Level;
}

export interface LectureChapterJob extends PipelineJob {
  topicId: string;
  orderIndex: number;
  style: LectureStyle;
  /** Write this page and the rest of the chapter first: a learner is waiting there. */
  startAtPage?: number;
}

export interface LectureVoiceJob extends PipelineJob {
  pageNumber: number;
  style: LectureStyle;
  /** Omitted means the page itself. */
  kind?: SegmentKind;
}

export interface ExportJob extends PipelineJob {
  exportId: string;
  level: Level;
}

/**
 * Enqueuing is a port so handlers stay free of BullMQ, and so tests can assert
 * "this was enqueued" without Redis.
 */
export interface JobQueuePort {
  enqueueStep(
    step: Exclude<PipelineStep, 'export'>,
    job: PipelineJob,
  ): Promise<void>;
  enqueueSimplifyPages(jobs: SimplifyJob[]): Promise<void>;
  enqueueExport(job: ExportJob): Promise<void>;
  /** One job per chapter: plan its arc, then write its pages in order. */
  enqueueLectureChapters(jobs: LectureChapterJob[]): Promise<void>;
  /** One job per finished script: turn it into audio. */
  enqueueLectureVoices(jobs: LectureVoiceJob[]): Promise<void>;
  /** Writes a document about a topic, then starts the normal pipeline. */
  enqueueLearn(job: PipelineJob): Promise<void>;
  /** Fetches an imported document's pages, then starts the normal pipeline. */
  enqueueImport(job: PipelineJob): Promise<void>;
  /** Raises priority for pages N..N+3 so the page being read lands first. */
  prioritise(input: {
    documentId: string;
    contentVersion: number;
    level: Level;
    fromPage: number;
    toPage: number;
  }): Promise<void>;
}
