import { Inject, Injectable } from '@nestjs/common';
import type {
  RequestVisualsResponse,
  VisualPageDto,
  VisualSetDto,
} from '../../../contracts';
import { chaptersAhead } from '../../domain/lecture-ahead';
import { VISUAL_GENERATOR_VERSION } from '../../domain/visual';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { JOB_QUEUE } from '../../ports/tokens';
import type { JobQueuePort, VisualSceneJob } from '../../ports/job-queue.port';
import {
  DOCUMENT_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type {
  TopicRecord,
  TopicRepository,
} from '../../repositories/misc.repository';
import type {
  VisualSceneRecord,
  VisualSceneRepository,
} from '../../repositories/visual.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

export interface VisualSetRequest {
  userId: string;
  documentId: string;
}

const chapterOf = (topics: TopicRecord[], page: number) =>
  topics.find((topic) => page >= topic.startPage && page <= topic.endPage) ??
  null;

/** Every page with what it has: the shape the pane lists and follows. */
async function setOf(
  topics: TopicRepository,
  visuals: VisualSceneRepository,
  documentId: string,
  contentVersion: number,
  pageCount: number,
): Promise<VisualSetDto> {
  const [chapters, rows] = await Promise.all([
    topics.listByDocument(documentId),
    visuals.listByDocument(
      documentId,
      contentVersion,
      VISUAL_GENERATOR_VERSION,
    ),
  ]);
  const byPage = new Map<number, VisualSceneRecord>(
    rows.map((row) => [row.pageNumber, row]),
  );
  const pages: VisualPageDto[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const chapter = chapterOf(chapters, page);
    const row = byPage.get(page);
    pages.push({
      page,
      topicId: chapter?.id ?? null,
      chapterTitle: chapter?.title ?? null,
      title: row?.status === 'done' ? row.title : null,
      status: row?.status ?? 'none',
      step: row?.status === 'making' ? (row.step ?? null) : null,
      reason:
        row?.status === 'not_suitable'
          ? row.fitReason
          : row?.status === 'failed'
            ? row.error
            : null,
      durationMs: row?.status === 'done' ? row.durationMs : null,
      hasScene: row?.status === 'done' && Boolean(row.timeline),
    });
  }
  return { documentId, pageCount, pages };
}

/** Every page of the document and where its tutorial stands. */
@Injectable()
export class VisualSetHandler extends AbstractRequestHandlerTemplate<
  VisualSetRequest,
  VisualSetDto
> {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(VISUAL_SCENE_REPOSITORY)
    private readonly visuals: VisualSceneRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VisualSetRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    return CommandResponse.of(
      await setOf(
        this.topics,
        this.visuals,
        doc.id,
        doc.contentVersion,
        doc.props.pageCount ?? 0,
      ),
    );
  }
}

export interface RequestVisualsCommand extends VisualSetRequest {
  /** Ahead of this page, the way the lecture prepares: the chapter from here, the next when the runway is short, a small book whole. */
  fromPage?: number;
  /** Or these pages by number. */
  pages?: number[];
}

/**
 * Tutorials asked for from the reader. Ahead of a page, the pages are
 * the ones the lecture would prepare, nearest first; by number, exactly
 * those. A page already made or being made is left alone; a failed one
 * is asked for again; one judged unsuited stays so unless asked for by
 * number. Empty pages and pages outside every chapter are skipped.
 */
@Injectable()
export class RequestVisualsHandler extends AbstractRequestHandlerTemplate<
  RequestVisualsCommand,
  RequestVisualsResponse
> {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(VISUAL_SCENE_REPOSITORY)
    private readonly visuals: VisualSceneRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: RequestVisualsCommand) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    if (doc.props.status !== 'ready') {
      throw new ValidationError('The document is still being prepared');
    }
    const pageCount = doc.props.pageCount ?? 0;
    const topics = await this.topics.listByDocument(doc.id);
    if (!topics.length || !pageCount) {
      throw new ValidationError('This document has no chapters to draw from');
    }
    const byNumber = Boolean(cmd.pages?.length);
    const wanted: { page: number; priority: number }[] = [];
    if (byNumber) {
      Array.from(new Set(cmd.pages))
        .filter((page) => page >= 1 && page <= pageCount)
        .sort((a, b) => a - b)
        .forEach((page, i) => wanted.push({ page, priority: i + 1 }));
    } else {
      const from = Math.max(1, Math.min(pageCount, cmd.fromPage ?? 1));
      const ahead = chaptersAhead({
        topics: topics.map((topic) => ({
          id: topic.id,
          startPage: topic.startPage,
          endPage: topic.endPage,
        })),
        pageCount,
        page: from,
        written: new Set(),
      });
      for (const chapter of ahead) {
        const topic = topics.find((t) => t.id === chapter.topicId);
        if (!topic) continue;
        const start = chapter.startAtPage ?? topic.startPage;
        for (let page = start; page <= topic.endPage; page += 1) {
          wanted.push({ page, priority: wanted.length + 1 });
        }
      }
    }
    if (!wanted.length) throw new NotFoundError('Page');
    const texts = await this.pages.findRange(doc.id, 1, pageCount);
    const empty = new Set(
      texts.filter((row) => row.isEmpty).map((row) => row.pageNumber),
    );
    let queued = 0;
    let existing = 0;
    const jobs: VisualSceneJob[] = [];
    for (const { page, priority } of wanted) {
      const chapter = chapterOf(topics, page);
      if (!chapter || empty.has(page)) continue;
      const { record, created } = await this.visuals.ensure({
        documentId: doc.id,
        contentVersion: doc.contentVersion,
        pageNumber: page,
        topicId: chapter.id,
        generatorVersion: VISUAL_GENERATOR_VERSION,
        requestedBy: cmd.userId,
      });
      const again =
        !created &&
        (record.status === 'failed' ||
          (byNumber && record.status === 'not_suitable'));
      if (again) await this.visuals.resetForRetry(record.id);
      if (created || again) {
        queued += 1;
        jobs.push({
          documentId: doc.id,
          contentVersion: doc.contentVersion,
          pageNumber: page,
          topicId: chapter.id,
          requestedBy: cmd.userId,
          priority,
        });
      } else {
        existing += 1;
      }
    }
    if (jobs.length) await this.queue.enqueueVisualScenes(jobs);
    const set = await setOf(
      this.topics,
      this.visuals,
      doc.id,
      doc.contentVersion,
      pageCount,
    );
    return CommandResponse.of({ ...set, queued, existing });
  }
}

export interface VisualSceneRequest extends VisualSetRequest {
  page: number;
}

/** One page's tutorial, once made: the timeline the pane plays. */
@Injectable()
export class VisualSceneHandler extends AbstractRequestHandlerTemplate<
  VisualSceneRequest,
  VisualSceneRecord
> {
  constructor(
    @Inject(VISUAL_SCENE_REPOSITORY)
    private readonly visuals: VisualSceneRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VisualSceneRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const record = await this.visuals.find(
      doc.id,
      doc.contentVersion,
      cmd.page,
      VISUAL_GENERATOR_VERSION,
    );
    if (!record || record.status !== 'done' || !record.timeline) {
      throw new NotFoundError('Visual for this page');
    }
    return CommandResponse.of(record);
  }
}
