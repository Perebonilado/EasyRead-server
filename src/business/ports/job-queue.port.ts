import type { Level, PipelineStep } from '../../contracts';

export interface PipelineJob {
  documentId: string;
  contentVersion: number;
}

export interface SimplifyJob extends PipelineJob {
  pageNumber: number;
  level: Level;
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
  /** Raises priority for pages N..N+3 so the page being read lands first. */
  prioritise(input: {
    documentId: string;
    level: Level;
    fromPage: number;
    toPage: number;
  }): Promise<void>;
}
