import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { CLOCK, JOB_QUEUE } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { JobQueuePort } from '../../ports/job-queue.port';
import {
  DOCUMENT_REPOSITORY,
  READING_POSITION_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import type {
  ReadingPositionRepository,
  TopicRepository,
} from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

// ── Priority boost ───────────────────────────────────────────────────────────

export interface PrioritiseRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
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
      fromPage: cmd.pageNumber,
      toPage: cmd.pageNumber + 3,
    });
    return CommandResponse.empty();
  }
}

// ── Retry one failed page ────────────────────────────────────────────────────

export interface RetryPageRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
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

    const page = await this.pages.find(cmd.documentId, cmd.pageNumber);
    if (!page) throw new NotFoundError('Page');

    await this.pages.reset(cmd.documentId, cmd.pageNumber);
    await this.queue.enqueueSimplifyPages([
      {
        documentId: cmd.documentId,
        contentVersion: doc.contentVersion,
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
  level: 'original' | 'standard';
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
    const doc = await this.access.requireOwned(cmd.documentId, cmd.userId);
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
    const doc = await this.access.requireOwned(cmd.documentId, cmd.userId);
    // Soft delete now; the purge job removes files and rows after the
    // recovery window (§10).
    doc.softDelete(this.clock.now());
    await this.documents.save(doc);
    return CommandResponse.empty();
  }
}
