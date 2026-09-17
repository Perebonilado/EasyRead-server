import { Inject, Injectable } from '@nestjs/common';
import type {
  RequestVisualsResponse,
  VisualChapterDto,
  VisualSetDto,
} from '../../../contracts';
import { VISUAL_GENERATOR_VERSION } from '../../domain/visual';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { JOB_QUEUE } from '../../ports/tokens';
import type { JobQueuePort } from '../../ports/job-queue.port';
import {
  TOPIC_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../../repositories/tokens';
import type { TopicRepository } from '../../repositories/misc.repository';
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

/** The document's chapters with what each has: the shape the picker and the pane read. */
async function setOf(
  topics: TopicRepository,
  visuals: VisualSceneRepository,
  documentId: string,
  contentVersion: number,
): Promise<VisualSetDto> {
  const [chapters, rows] = await Promise.all([
    topics.listByDocument(documentId),
    visuals.listByDocument(
      documentId,
      contentVersion,
      VISUAL_GENERATOR_VERSION,
    ),
  ]);
  const byTopic = new Map<string, VisualSceneRecord>(
    rows.map((row) => [row.topicId, row]),
  );
  return {
    documentId,
    chapters: [...chapters]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((topic): VisualChapterDto => {
        const row = byTopic.get(topic.id);
        return {
          topicId: topic.id,
          title: topic.title,
          orderIndex: topic.orderIndex,
          startPage: topic.startPage,
          endPage: topic.endPage,
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
        };
      }),
  };
}

/** Every chapter of the document and where its scene stands. */
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
      await setOf(this.topics, this.visuals, doc.id, doc.contentVersion),
    );
  }
}

export interface RequestVisualsCommand extends VisualSetRequest {
  topicIds: string[];
}

/**
 * The student's pick of chapters: a row for each, made once per document
 * version. A chapter already made or being made is left alone; a failed
 * one is asked for again; one the planner judged unsuited stays so, with
 * its reason, unless asked for by name again.
 */
@Injectable()
export class RequestVisualsHandler extends AbstractRequestHandlerTemplate<
  RequestVisualsCommand,
  RequestVisualsResponse
> {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
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
    const known = new Set(
      (await this.topics.listByDocument(doc.id)).map((topic) => topic.id),
    );
    const wanted = Array.from(new Set(cmd.topicIds)).filter((id) =>
      known.has(id),
    );
    if (!wanted.length) throw new NotFoundError('Chapter');
    let queued = 0;
    let existing = 0;
    const jobs: {
      documentId: string;
      contentVersion: number;
      topicId: string;
      requestedBy: string;
    }[] = [];
    for (const topicId of wanted) {
      const { record, created } = await this.visuals.ensure({
        documentId: doc.id,
        contentVersion: doc.contentVersion,
        topicId,
        generatorVersion: VISUAL_GENERATOR_VERSION,
        requestedBy: cmd.userId,
      });
      const again =
        !created &&
        (record.status === 'failed' || record.status === 'not_suitable');
      if (again) await this.visuals.resetForRetry(record.id);
      if (created || again) {
        queued += 1;
        jobs.push({
          documentId: doc.id,
          contentVersion: doc.contentVersion,
          topicId,
          requestedBy: cmd.userId,
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
    );
    return CommandResponse.of({ ...set, queued, existing });
  }
}

export interface VisualSceneRequest extends VisualSetRequest {
  topicId: string;
}

/** One chapter's scene, once made: the timeline the pane plays. */
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
      cmd.topicId,
      VISUAL_GENERATOR_VERSION,
    );
    if (!record || record.status !== 'done' || !record.timeline) {
      throw new NotFoundError('Visual for this chapter');
    }
    return CommandResponse.of(record);
  }
}
