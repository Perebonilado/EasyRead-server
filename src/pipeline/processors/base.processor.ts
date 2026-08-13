import { Logger } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import type { Document } from '../../business/domain/entities/document';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { PipelineRunRepository } from '../../business/repositories/misc.repository';
import type { BaseJobData } from '../queues';

/**
 * Shared job preamble: is this job still relevant, and has this step already
 * run?
 *
 * Both checks matter because jobs outlive the state that produced them. A
 * re-uploaded document bumps `contentVersion`, and any job still queued for the
 * old version must exit quietly rather than write stale content over the new
 * one (§4.6).
 */
export abstract class BasePipelineProcessor<T extends BaseJobData> {
  protected readonly logger = new Logger(this.constructor.name);

  protected abstract readonly step: PipelineStep;
  protected abstract readonly documents: DocumentRepository;
  protected abstract readonly runs: PipelineRunRepository;

  /**
   * Returns the document when the job should proceed, `null` when it should be
   * dropped. Dropping is deliberately silent — a superseded job is normal
   * operation, not a failure.
   */
  protected async begin(job: T): Promise<Document | null> {
    const doc = await this.documents.findById(job.documentId);
    if (!doc) {
      this.logger.warn(`${job.documentId}: gone before ${this.step}`);
      return null;
    }
    if (doc.props.deletedAt) return null;

    if (doc.contentVersion !== job.contentVersion) {
      this.logger.log(
        `${job.documentId}: skipping ${this.step}, job is for v${job.contentVersion} and the document is at v${doc.contentVersion}`,
      );
      return null;
    }

    if (!(await this.runs.claim(job.documentId, this.step))) {
      this.logger.log(`${job.documentId}: ${this.step} already done`);
      return null;
    }

    return doc;
  }

  protected async succeed(job: T): Promise<void> {
    await this.runs.complete(job.documentId, this.step);
  }
}

/**
 * A failure the file itself caused — damaged bytes, the wrong format, too
 * large. Retrying cannot change the answer, so the runner stops rather than
 * spending the queue's remaining attempts to arrive at the same place slower.
 *
 * Domain errors carry an HTTP status: 4xx is the caller's or the file's fault,
 * 5xx is ours or a provider's and is worth another go.
 */
export function isPermanentFailure(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** What the runner knows about the attempt, and the processor doesn't. */
export interface JobContext {
  /** True when BullMQ has no retries left, so the failure is now permanent. */
  isFinalAttempt: boolean;
  attemptsMade: number;
}
