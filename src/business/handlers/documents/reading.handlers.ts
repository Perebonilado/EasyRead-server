import { Inject, Injectable } from '@nestjs/common';
import type { Level } from '../../../contracts';
import {
  AlreadyInProgressError,
  DocumentNotReadyError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { CLOCK, JOB_QUEUE } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { JobQueuePort } from '../../ports/job-queue.port';
import {
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  READING_POSITION_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import type {
  PipelineRunRepository,
  ReadingPositionRepository,
  TopicRepository,
} from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import { PipelineOrchestrator } from '../../../pipeline/orchestrator.service';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

// ── Priority boost ───────────────────────────────────────────────────────────

export interface PrioritiseRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
  level: Level;
}

/**
 * The reader has arrived at a page that isn't written yet. Bump that page and
 * the next three to the front of the queue (PRD FR-1.7).
 */
@Injectable()
export class PrioritisePagesHandler extends AbstractRequestHandlerTemplate<
  PrioritiseRequest,
  void
> {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: PrioritiseRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    await this.queue.prioritise({
      documentId: cmd.documentId,
      contentVersion: doc.contentVersion,
      level: cmd.level,
      fromPage: cmd.pageNumber,
      toPage: cmd.pageNumber + 3,
    });
    return CommandResponse.empty();
  }
}

// ── Easiest Read ─────────────────────────────────────────────────────────────

export interface StartEasiestRequest {
  userId: string;
  documentId: string;
}

/**
 * Spends one Easiest conversion and fans out a second full pass over the
 * document at the easier level. Idempotent: asking twice while it's running is
 * a 409 rather than a second charge (§3.2).
 */
@Injectable()
export class StartEasiestHandler extends AbstractRequestHandlerTemplate<
  StartEasiestRequest,
  void
> {
  constructor(
    @Inject(PIPELINE_RUN_REPOSITORY)
    private readonly runs: PipelineRunRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly pipeline: PipelineOrchestrator,
  ) {
    super();
  }

  protected async handleRequest(cmd: StartEasiestRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    if (doc.props.simplificationUnavailable) {
      throw new DocumentNotReadyError(
        "This document's text can't be simplified",
      );
    }
    if (!doc.props.pageCount) {
      throw new DocumentNotReadyError('This document is still being prepared');
    }

    const status = await this.runs.status(cmd.documentId, 'simplify_easiest');
    if (status === 'done')
      throw new AlreadyInProgressError('Easiest Read is already available');
    if (status === 'running' || status === 'queued') {
      throw new AlreadyInProgressError('Easiest Read is already being written');
    }

    // Easiest conversions are no longer counted; the study clock is the
    // meter now, and this is exactly the kind of study action it guards.
    await this.entitlements.assertStudyTime(cmd.userId);

    await this.pipeline.fanOutSimplify(doc.id, doc.contentVersion, 'easiest');

    return CommandResponse.empty();
  }
}

// ── Retry one failed page ────────────────────────────────────────────────────

export interface RetryPageRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
  level: Level;
}

/**
 * Per-page failure isolation: one bad page never blocks the rest, and retrying
 * it costs nothing but that page (PRD FR-1.5).
 */
@Injectable()
export class RetryPageHandler extends AbstractRequestHandlerTemplate<
  RetryPageRequest,
  void
> {
  constructor(
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly pages: SimplifiedPageRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: RetryPageRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const page = await this.pages.find(
      cmd.documentId,
      cmd.level,
      cmd.pageNumber,
    );
    if (!page) throw new NotFoundError('Page');

    await this.pages.reset(cmd.documentId, cmd.level, cmd.pageNumber);
    await this.queue.enqueueSimplifyPages([
      {
        documentId: cmd.documentId,
        contentVersion: doc.contentVersion,
        level: cmd.level,
        pageNumber: cmd.pageNumber,
      },
    ]);

    return CommandResponse.empty();
  }
}

// ── Reading position ─────────────────────────────────────────────────────────

export interface SavePositionRequest {
  userId: string;
  documentId: string;
  lastPage: number;
  level: 'original' | 'standard' | 'easiest';
}

@Injectable()
export class SavePositionHandler extends AbstractRequestHandlerTemplate<
  SavePositionRequest,
  void
> {
  constructor(
    @Inject(READING_POSITION_REPOSITORY)
    private readonly positions: ReadingPositionRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: SavePositionRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const pageCount = doc.props.pageCount ?? 1;
    if (cmd.lastPage < 1 || cmd.lastPage > pageCount) {
      throw new ValidationError('That page is outside this document');
    }

    await this.positions.upsert(cmd.documentId, cmd.userId, {
      lastPage: cmd.lastPage,
      level: cmd.level,
    });
    return CommandResponse.empty();
  }
}

// ── Topic read state ─────────────────────────────────────────────────────────

export interface MarkTopicsRequest {
  userId: string;
  topicIds: string[];
  read: boolean;
}

@Injectable()
export class MarkTopicsHandler extends AbstractRequestHandlerTemplate<
  MarkTopicsRequest,
  void
> {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: MarkTopicsRequest) {
    if (!cmd.topicIds.length) return CommandResponse.empty();

    // Topics are addressed by id without a document in the path, so ownership
    // has to be proven here rather than by the usual document guard.
    if (!(await this.topics.belongToUser(cmd.topicIds, cmd.userId))) {
      throw new NotFoundError('Topic');
    }

    if (cmd.read)
      await this.topics.markRead(cmd.topicIds, cmd.userId, this.clock.now());
    else await this.topics.markUnread(cmd.topicIds, cmd.userId);

    return CommandResponse.empty();
  }
}

// ── Rename / delete ──────────────────────────────────────────────────────────

export interface RenameDocumentRequest {
  userId: string;
  documentId: string;
  title: string;
}

@Injectable()
export class RenameDocumentHandler extends AbstractRequestHandlerTemplate<
  RenameDocumentRequest,
  void
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: RenameDocumentRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const title = cmd.title.trim();
    if (!title) throw new ValidationError('A document needs a name');

    doc.rename(title.slice(0, 500));
    await this.documents.save(doc);
    return CommandResponse.empty();
  }
}

export interface DeleteDocumentRequest {
  userId: string;
  documentId: string;
}

@Injectable()
export class DeleteDocumentHandler extends AbstractRequestHandlerTemplate<
  DeleteDocumentRequest,
  void
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: DeleteDocumentRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    // Soft delete now; the purge job removes files and rows after the
    // recovery window (§10).
    doc.softDelete(this.clock.now());
    await this.documents.save(doc);
    return CommandResponse.empty();
  }
}
