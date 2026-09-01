import { Inject, Injectable } from '@nestjs/common';
import type {
  LecturePosition,
  LectureStatusResponse,
  LectureTopicDto,
} from '../../../contracts';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { JOB_QUEUE } from '../../ports/tokens';
import type { JobQueuePort } from '../../ports/job-queue.port';
import {
  DOCUMENT_PAGE_REPOSITORY,
  LECTURE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import {
  LECTURE_GENERATOR_VERSION,
  cutPlanIntoJobs,
} from '../../domain/lecture';
import type { LectureRepository } from '../../repositories/lecture.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

export interface LectureRequest {
  userId: string;
  documentId: string;
}

export interface GenerateLectureRequest extends LectureRequest {
  /**
   * The chapters to write. Omitted means the whole document.
   *
   * A student does not have to wait for a book to be lectured before
   * hearing a chapter of it, and can come back for more later: seeding is
   * idempotent, so asking again for a chapter already written rewrites
   * only the pages of it that failed.
   */
  topicIds?: string[];
  /**
   * Discard the whole lecture and write it again, under the current
   * generator. The one way an existing lecture picks up new rules.
   */
  rewrite?: boolean;
}

const IN_FLIGHT = new Set(['pending', 'writing', 'voicing']);

/** The shape of the lecture: what is written, what is still coming. */
@Injectable()
export class LectureStatusHandler extends AbstractRequestHandlerTemplate<
  LectureRequest,
  LectureStatusResponse
> {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: LectureRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const [topics, segments, position] = await Promise.all([
      this.topics.listByDocument(doc.id),
      this.lectures.listSegments(doc.id, doc.contentVersion),
      this.lectures.findPosition(cmd.userId, doc.id),
    ]);

    const byTopic = new Map<string, LectureTopicDto>();
    for (const topic of topics) {
      byTopic.set(topic.id, {
        topicId: topic.id,
        title: topic.title,
        segments: [],
      });
    }

    for (const segment of segments) {
      const entry = segment.topicId ? byTopic.get(segment.topicId) : undefined;
      entry?.segments.push({
        pageNumber: segment.pageNumber,
        status: segment.status,
        durationMs: segment.durationMs,
        bridge: segment.bridge,
      });
    }

    // Chapters with nothing written yet are still listed, so the player can
    // show the whole shape of what is coming.
    const ordered = topics
      .map((topic) => byTopic.get(topic.id)!)
      .filter((entry) => entry.segments.length > 0);

    return CommandResponse.of({
      generated: segments.length > 0,
      totalSegments: segments.length,
      readySegments: segments.filter((s) => s.status === 'done').length,
      failedSegments: segments.filter((s) => s.status === 'failed').length,
      topics: ordered,
      position,
    } satisfies LectureStatusResponse);
  }
}

/**
 * Starts writing a document's lecture.
 *
 * Idempotent by content version: asking again while it is being written
 * returns the state rather than a second set of model calls. One job per
 * chapter goes out; each of those fans out its own pages once it has an
 * arc to cut.
 */
@Injectable()
export class GenerateLectureHandler extends AbstractRequestHandlerTemplate<
  GenerateLectureRequest,
  LectureStatusResponse
> {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly status: LectureStatusHandler,
  ) {
    super();
  }

  protected async handleRequest(cmd: GenerateLectureRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    // Writing a lecture is a page's worth of model calls per page, so it
    // sits behind the same daily study gate as generating a test.
    await this.entitlements.assertStudyTime(cmd.userId);

    const topics = await this.topics.listByDocument(doc.id);
    const pageCount = doc.props.pageCount;
    if (!topics.length || !pageCount) {
      throw new ValidationError(
        'This document has no chapters yet. It needs to finish importing first',
      );
    }

    if (cmd.rewrite) {
      // A chapter job still running would write its old script into the
      // fresh rows, and the queue cannot remove a running job, so a rewrite
      // waits for quiet. Positions are kept: the student resumes where
      // they were, in the new lecture.
      const current = await this.lectures.listSegments(
        doc.id,
        doc.contentVersion,
      );
      if (current.some((row) => IN_FLIGHT.has(row.status))) {
        throw new ValidationError(
          'The lecture is still being written. Wait for it to finish, then rewrite it',
        );
      }
      await this.lectures.clear(doc.id);
    }

    // The whole document is cut in one pass EVERY time, even when only a
    // chapter was asked for: play order has to stay document-global and
    // stable, or a chapter added later would renumber the lecture and
    // collide with what is already there. The selection is applied after
    // the cut, never before it.
    const pages = await this.pages.findRange(doc.id, 1, pageCount);
    const allSegments = cutPlanIntoJobs(
      topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        startPage: topic.startPage,
        endPage: topic.endPage,
      })),
      pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        isEmpty: page.isEmpty,
      })),
    );

    // A rewrite is always the whole document.
    const wanted =
      !cmd.rewrite && cmd.topicIds?.length ? new Set(cmd.topicIds) : null;
    const segments = wanted
      ? allSegments.filter((segment) => wanted.has(segment.topicId))
      : allSegments;
    if (!segments.length) {
      throw new ValidationError(
        'None of those chapters have anything to lecture on',
      );
    }

    // Every row exists before any model call, so the player can show the
    // shape of what is coming while it is still being written.
    await this.lectures.seedSegments({
      documentId: doc.id,
      contentVersion: doc.contentVersion,
      generatorVersion: LECTURE_GENERATOR_VERSION,
      segments,
    });

    // Only chapters that actually own pages: one whose range is entirely
    // front matter would spend a planning call on nothing to teach.
    const owning = new Set(segments.map((segment) => segment.topicId));

    // A chapter asked for again has its failed pages written again. Only a
    // chapter that has finished qualifies: one still being written reaches
    // its unwritten pages by itself. The rows go back to pending so the
    // player shows them as coming, and the chapter job below is queued
    // afresh (the queue replaces a finished job of the same name and
    // leaves a running one alone).
    const existing = await this.lectures.listSegments(
      doc.id,
      doc.contentVersion,
    );
    const retry = [...owning].filter((topicId) => {
      const rows = existing.filter((row) => row.topicId === topicId);
      return (
        rows.some((row) => row.status === 'failed') &&
        !rows.some((row) => IN_FLIGHT.has(row.status))
      );
    });
    if (retry.length) {
      await this.lectures.resetFailedSegments(
        doc.id,
        doc.contentVersion,
        retry,
      );
    }

    await this.queue.enqueueLectureChapters(
      topics
        .filter((topic) => owning.has(topic.id))
        .map((topic) => ({
          documentId: doc.id,
          contentVersion: doc.contentVersion,
          topicId: topic.id,
          orderIndex: topic.orderIndex,
        })),
    );

    const { data } = await this.status.handle(cmd);
    return CommandResponse.of(data);
  }
}

export interface LectureAudioRequest extends LectureRequest {
  pageNumber: number;
}

/** Serves one segment's audio, once it has been voiced. */
@Injectable()
export class LectureAudioHandler extends AbstractRequestHandlerTemplate<
  LectureAudioRequest,
  { fileRef: string; mimeType: string }
> {
  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: LectureAudioRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const segment = await this.lectures.findSegment(
      doc.id,
      cmd.pageNumber,
      doc.contentVersion,
    );
    if (!segment?.audioKey || segment.status !== 'done') {
      throw new NotFoundError('Lecture audio for this page');
    }
    return CommandResponse.of({
      fileRef: segment.audioKey,
      mimeType: 'audio/mpeg',
    });
  }
}

export interface SaveLecturePositionRequest extends LectureRequest {
  pageNumber: number;
  offsetMs: number;
}

/** Remembers where the listening stopped, so any device resumes there. */
@Injectable()
export class SaveLecturePositionHandler extends AbstractRequestHandlerTemplate<
  SaveLecturePositionRequest,
  LecturePosition
> {
  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: SaveLecturePositionRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const position = {
      pageNumber: Math.max(1, Math.round(cmd.pageNumber)),
      offsetMs: Math.max(0, Math.round(cmd.offsetMs)),
    };
    await this.lectures.savePosition({
      userId: cmd.userId,
      documentId: doc.id,
      ...position,
    });
    return CommandResponse.of(position);
  }
}
