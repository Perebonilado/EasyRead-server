import { Inject, Injectable } from '@nestjs/common';
import {
  LECTURE_STYLE_KEYS,
  type LecturePosition,
  type LectureStatusResponse,
  type LectureStyle,
  type LectureStyleSummary,
  type LectureBoardResponse,
  type LectureFollowResponse,
  type LectureTopicDto,
  type SegmentKind,
} from '../../../contracts';
import {
  boardIsCurrent,
  type BoardTimeline,
  type WordTimes,
} from '../../domain/board';
import { followIsCurrent, type FollowTrack } from '../../domain/follow';
import { ConfigService } from '@nestjs/config';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { JOB_QUEUE, LLM_GATEWAY } from '../../ports/tokens';
import type { JobQueuePort } from '../../ports/job-queue.port';
import type { LlmGatewayPort } from '../../ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  LECTURE_REPOSITORY,
  TOPIC_REPOSITORY,
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
} from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import {
  DEFAULT_LECTURE_STYLE,
  EXTRAS_BY_STYLE,
  EXTRA_BUDGET,
  LECTURE_GENERATOR_VERSION,
  LECTURE_STYLES,
  type LecturePlan,
  beatFor,
  cutPlanIntoJobs,
  estimateDurationMs,
  extraSeeds,
  scriptForTts,
  effectiveStatus,
  IN_FLIGHT_STATUSES,
  chosenLectureStyle,
} from '../../domain/lecture';
import { chaptersAhead } from '../../domain/lecture-ahead';
import type { LectureRepository } from '../../repositories/lecture.repository';
import type {
  DocumentLearningStateRepository,
  LearnerProfileRepository,
} from '../../repositories/learning.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

export interface LectureRequest {
  userId: string;
  documentId: string;
  /**
   * Which way of teaching. Omitted means the style the student was last
   * listening in, or steady before they have chosen.
   */
  style?: LectureStyle;
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
   * Discard this style of the lecture and write it again, under the
   * current generator. The one way an existing lecture picks up new rules.
   */
  rewrite?: boolean;
  /**
   * A learner switched style here, mid-chapter: this page and the rest of
   * its chapter are written first, before anything else.
   */
  startAtPage?: number;
  /**
   * Teach me from this page: the chapters to prepare are chosen by the
   * always-a-chapter-ahead rule around it, in place of `topicIds`, and the
   * chapter the page is in starts writing there.
   */
  aheadOfPage?: number;
}

const IN_FLIGHT = IN_FLIGHT_STATUSES;

/** The shape of the lecture: what is written, what is still coming. */
@Injectable()
export class LectureStatusHandler extends AbstractRequestHandlerTemplate<
  LectureRequest,
  LectureStatusResponse
> {
  /** Whether the hidden whiteboard is still written in the background. */
  private readonly boardsOn: boolean;
  /** Whether a worker measures the spoken words on the audio. */
  private readonly alignOn: boolean;

  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
    private readonly config: ConfigService,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
  ) {
    super();
    this.boardsOn =
      this.config.get<string>('LECTURE_BOARD_ENABLED', 'false') === 'true';
    // The same reading the aligner adapter makes of its engine setting.
    const engine = this.config.get<string>('LECTURE_ALIGN_ENGINE', 'dtw');
    this.alignOn = engine === 'dtw' || engine === 'whisper';
  }

  protected async handleRequest(cmd: LectureRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const [topics, everything, position, docState, profile] = await Promise.all(
      [
        this.topics.listByDocument(doc.id),
        this.lectures.listSegments(doc.id, doc.contentVersion),
        this.lectures.findPosition(cmd.userId, doc.id),
        this.docStates.find(cmd.userId, doc.id).catch(() => null),
        this.profiles.find(cmd.userId).catch(() => null),
      ],
    );

    // The style asked for, else the one chosen for this document or for
    // every document, else the one the student was listening in.
    const chosen = chosenLectureStyle(
      docState?.lectureStyle,
      profile?.lectureStyle,
    );
    const style =
      cmd.style ?? chosen.style ?? position?.style ?? DEFAULT_LECTURE_STYLE;
    const segments = everything.filter((segment) => segment.style === style);

    // A board written by an older writer, or never written for a row that
    // has its words, is written again in the background: the board is
    // read alongside the words, so a cut-off line is not left on it. The
    // words and the audio stay; the pane picks the new board up once it is
    // timed. Rows already being written, or that failed, are left alone.
    // The follow-along track for rows that have their words but no
    // current track: the reader's eye follows the voice into the note.
    const untracked = segments.filter(
      (row) =>
        row.scriptText &&
        row.status === 'done' &&
        (row.kind === 'page' || row.kind === 'part') &&
        (row.followStatus !== 'done' ||
          !followIsCurrent((row.follow as FollowTrack | null) ?? null) ||
          // Built while the embedding service was away: worth another go.
          (row.follow as FollowTrack | null)?.meaning === false),
    );
    if (untracked.length) {
      const here = position?.pageNumber ?? untracked[0].pageNumber;
      const nearestFirst = [...untracked].sort(
        (a, b) =>
          Math.abs(a.pageNumber - here) - Math.abs(b.pageNumber - here) ||
          a.seq - b.seq,
      );
      await this.queue
        .enqueueLectureFollows(
          nearestFirst.map((row, index) => ({
            documentId: doc.id,
            contentVersion: doc.contentVersion,
            pageNumber: row.pageNumber,
            style,
            kind: row.kind,
            priority: index + 1,
          })),
        )
        .catch(() => undefined);
    }

    // Rows voiced but never measured: the aligner times their words so
    // the follow-along track can point at the sentence, not just the
    // block. Nearest the learner first; a row measured on other audio
    // (voiced again since) counts as unmeasured.
    if (this.alignOn) {
      const unmeasured = segments.filter((row) => {
        if (!row.scriptText || row.status !== 'done' || !row.audioKey) {
          return false;
        }
        if (row.kind !== 'page' && row.kind !== 'part') return false;
        const times = (row.wordTimes as WordTimes | null) ?? null;
        return (
          !times ||
          times.audioKey !== row.audioKey ||
          times.source === 'estimate'
        );
      });
      if (unmeasured.length) {
        const here = position?.pageNumber ?? unmeasured[0].pageNumber;
        const nearestFirst = [...unmeasured].sort(
          (a, b) =>
            Math.abs(a.pageNumber - here) - Math.abs(b.pageNumber - here) ||
            a.seq - b.seq,
        );
        await this.queue
          .enqueueLectureAligns(
            nearestFirst.map((row, index) => ({
              documentId: doc.id,
              contentVersion: doc.contentVersion,
              pageNumber: row.pageNumber,
              style,
              kind: row.kind,
              priority: index + 1,
            })),
          )
          .catch(() => undefined);
      }
    }

    const stale = this.boardsOn
      ? segments.filter(
          (row) =>
            row.scriptText &&
            row.status === 'done' &&
            (row.boardStatus === 'none' ||
              (row.boardStatus === 'done' &&
                !boardIsCurrent(row.board as BoardTimeline | null))),
        )
      : [];
    if (stale.length) {
      // Nearest the learner first: the page they are on, then outwards.
      const here = position?.pageNumber ?? stale[0].pageNumber;
      const nearestFirst = [...stale].sort(
        (a, b) =>
          Math.abs(a.pageNumber - here) - Math.abs(b.pageNumber - here) ||
          a.seq - b.seq,
      );
      await this.queue
        .enqueueLectureBoards(
          nearestFirst.map((row, index) => ({
            documentId: doc.id,
            contentVersion: doc.contentVersion,
            pageNumber: row.pageNumber,
            style,
            kind: row.kind,
            priority: index + 1,
          })),
        )
        .catch(() => undefined);
    }

    // What exists in every style, so the picker and the bar know whether a
    // switch is instant or has to be written first.
    const styles = Object.fromEntries(
      LECTURE_STYLE_KEYS.map((key) => {
        const rows = everything.filter((segment) => segment.style === key);
        return [
          key,
          {
            total: rows.length,
            ready: rows.filter((row) => row.status === 'done').length,
          } satisfies LectureStyleSummary,
        ];
      }),
    ) as Record<LectureStyle, LectureStyleSummary>;

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
        kind: segment.kind,
        status: effectiveStatus(segment),
        durationMs: segment.durationMs,
        bridge: segment.bridge,
        moveOffsets: segment.moveOffsets ?? [],
        scriptLength: segment.scriptText?.length ?? null,
        boardStatus: segment.boardStatus ?? 'none',
        followStatus: segment.followStatus ?? 'none',
      });
    }

    // Chapters with nothing written yet are still listed, so the player can
    // show the whole shape of what is coming.
    const ordered = topics
      .map((topic) => byTopic.get(topic.id)!)
      .filter((entry) => entry.segments.length > 0);

    return CommandResponse.of({
      generated: everything.length > 0,
      style,
      totalSegments: segments.length,
      readySegments: segments.filter((s) => s.status === 'done').length,
      failedSegments: segments.filter((s) => s.status === 'failed').length,
      topics: ordered,
      position,
      styles,
      chosenStyle: chosen.style,
      styleSource: chosen.source,
    } satisfies LectureStatusResponse);
  }
}

export interface SetLectureStyleRequest extends LectureRequest {
  style: LectureStyle;
  /** Use it for every document on the account, not only this one. */
  all: boolean;
}

/**
 * How the learner learns, chosen once per document from the lecture bar,
 * and for every document when they ask for that.
 */
@Injectable()
export class SetLectureStyleHandler extends AbstractRequestHandlerTemplate<
  SetLectureStyleRequest,
  { style: LectureStyle; all: boolean }
> {
  constructor(
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: SetLectureStyleRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    await this.docStates.upsert(cmd.userId, doc.id, {
      lectureStyle: cmd.style,
    });
    if (cmd.all) {
      await this.profiles.upsert(cmd.userId, { lectureStyle: cmd.style });
    }
    return CommandResponse.of({ style: cmd.style, all: cmd.all });
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

    const style = cmd.style ?? DEFAULT_LECTURE_STYLE;

    if (cmd.rewrite) {
      // A chapter job still running would write its old script into the
      // fresh rows, and the queue cannot remove a running job, so a rewrite
      // waits for quiet. Positions are kept: the student resumes where
      // they were, in the new lecture. Only this style goes; the plan is
      // shared with the others and stays.
      const current = await this.lectures.listSegments(
        doc.id,
        doc.contentVersion,
        style,
      );
      if (current.some((row) => IN_FLIGHT.has(effectiveStatus(row)))) {
        throw new ValidationError(
          'The lecture is still being written. Wait for it to finish, then rewrite it',
        );
      }
      await this.lectures.clear(doc.id, style);
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

    // Teach me from a page: the rule around it picks the chapters, leaving
    // out those with a lecture already, written or on its way.
    const ahead =
      !cmd.rewrite && cmd.aheadOfPage
        ? chaptersAhead({
            topics: topics.map((topic) => ({
              id: topic.id,
              startPage: topic.startPage,
              endPage: topic.endPage,
            })),
            pageCount,
            page: cmd.aheadOfPage,
            written: new Set(
              (
                await this.lectures.listSegments(
                  doc.id,
                  doc.contentVersion,
                  style,
                )
              )
                .filter((row) => effectiveStatus(row) !== 'failed')
                .map((row) => row.topicId)
                .filter((topicId): topicId is string => Boolean(topicId)),
            ),
          })
        : null;
    if (ahead && !ahead.length) {
      // Everything around the page is there or coming: nothing to queue.
      const { data } = await this.status.handle({ ...cmd, style });
      return CommandResponse.of(data);
    }
    const aheadStart = ahead?.find((row) => row.startAtPage)?.startAtPage;
    const startAtPage = cmd.startAtPage ?? aheadStart;

    // A rewrite is always the whole document.
    const wanted = ahead
      ? new Set(ahead.map((row) => row.topicId))
      : !cmd.rewrite && cmd.topicIds?.length
        ? new Set(cmd.topicIds)
        : null;
    const segments = wanted
      ? allSegments.filter((segment) => wanted.has(segment.topicId))
      : allSegments;
    if (!segments.length) {
      throw new ValidationError(
        'None of those chapters have anything to lecture on',
      );
    }

    // Every row exists before any model call, so the player can show the
    // shape of what is coming while it is still being written. The extras
    // this style gets around each chapter are seeded with the pages.
    await this.lectures.seedSegments({
      documentId: doc.id,
      contentVersion: doc.contentVersion,
      generatorVersion: LECTURE_GENERATOR_VERSION,
      segments: [
        ...segments.map((segment) => ({
          ...segment,
          style,
          kind: 'page' as const,
        })),
        ...extraSeeds(segments, style).map((segment) => ({
          ...segment,
          style,
        })),
      ],
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
      style,
    );
    const retry = [...owning].filter((topicId) => {
      const rows = existing.filter((row) => row.topicId === topicId);
      // A row lost in flight (its worker died) counts as failed here, so
      // the chapter can be asked for again instead of waiting forever.
      return (
        rows.some((row) => effectiveStatus(row) === 'failed') &&
        !rows.some((row) => IN_FLIGHT.has(effectiveStatus(row)))
      );
    });
    if (retry.length) {
      await this.lectures.resetFailedSegments(
        doc.id,
        doc.contentVersion,
        retry,
        style,
      );
    }

    // The chapter a learner is waiting in goes first, and starts writing at
    // the page they are on. Prepared ahead, the rest queue by distance.
    const waitingIn = startAtPage
      ? segments.find((segment) => segment.pageNumber === startAtPage)?.topicId
      : undefined;
    const priorityOf = new Map(
      (ahead ?? []).map((row) => [row.topicId, row.priority]),
    );
    await this.queue.enqueueLectureChapters(
      topics
        .filter((topic) => owning.has(topic.id))
        .map((topic) => ({
          documentId: doc.id,
          contentVersion: doc.contentVersion,
          topicId: topic.id,
          orderIndex: topic.orderIndex,
          style,
          ...(waitingIn === topic.id ? { startAtPage } : {}),
          ...(priorityOf.has(topic.id)
            ? { priority: priorityOf.get(topic.id) }
            : {}),
        })),
    );

    const { data } = await this.status.handle({ ...cmd, style });
    return CommandResponse.of(data);
  }
}

export interface LectureAudioRequest extends LectureRequest {
  pageNumber: number;
  /** Omitted means the page itself. */
  kind?: SegmentKind;
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
      cmd.style ?? DEFAULT_LECTURE_STYLE,
      cmd.kind ?? 'page',
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
      style: cmd.style ?? DEFAULT_LECTURE_STYLE,
    };
    await this.lectures.savePosition({
      userId: cmd.userId,
      documentId: doc.id,
      ...position,
    });
    return CommandResponse.of(position);
  }
}

/** How long the learner must have been away for a review to be worth a minute. */
export const REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEW_LINES_MAX = 8;

/**
 * Writes the "last time" review a returning learner hears before the
 * lecture carries on.
 *
 * Written on demand, in the request, because it is one short model call
 * and the learner is waiting at the bar: a queue would only add latency.
 * The audio still goes through the voice queue. It sits on the page the
 * learner resumes at and plays before it; the review a previous return
 * wrote is dropped first, since where they were has moved. A quick learner
 * gets none, and a learner away less than a day gets none.
 */
@Injectable()
export class LectureReviewHandler extends AbstractRequestHandlerTemplate<
  LectureRequest,
  LectureStatusResponse
> {
  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
    private readonly status: LectureStatusHandler,
  ) {
    super();
  }

  protected async handleRequest(cmd: LectureRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const position = await this.lectures.findPosition(cmd.userId, doc.id);
    const style = cmd.style ?? position?.style ?? DEFAULT_LECTURE_STYLE;
    const finish = async () => {
      const { data } = await this.status.handle({ ...cmd, style });
      return CommandResponse.of(data);
    };

    if (!position || !EXTRAS_BY_STYLE[style].includes('review')) {
      return finish();
    }
    const away = position.updatedAt
      ? Date.now() - new Date(position.updatedAt).getTime()
      : 0;
    if (away < REVIEW_AFTER_MS) return finish();

    const rows = await this.lectures.listSegments(
      doc.id,
      doc.contentVersion,
      style,
    );
    const pages = rows.filter((row) => row.kind === 'page');
    const resume = pages.find((row) => row.pageNumber === position.pageNumber);
    if (!resume?.topicId) return finish();

    // What they heard last time: this chapter up to the page they are on,
    // or, when they stopped at a chapter's start, the chapter before it.
    const sameChapter = pages.filter(
      (row) => row.topicId === resume.topicId && row.seq < resume.seq,
    );
    const earlier = sameChapter.length
      ? sameChapter
      : pages.filter((row) => row.seq < resume.seq).slice(-REVIEW_LINES_MAX);
    const topicId = earlier[earlier.length - 1]?.topicId;
    if (!topicId) return finish();
    const chapter = earlier.filter((row) => row.topicId === topicId);
    const record = await this.lectures.findPlan(
      doc.id,
      topicId,
      doc.contentVersion,
    );
    const plan = record?.plan as LecturePlan | null | undefined;
    if (!plan) return finish();
    const taught = chapter
      .filter((row) => !row.bridge)
      .map((row) => {
        const beat = beatFor(plan, row.pageNumber);
        return beat.newHere?.trim() || beat.goal;
      })
      .slice(-REVIEW_LINES_MAX);
    if (!taught.length) return finish();

    await this.lectures.removeSegments(
      doc.id,
      doc.contentVersion,
      style,
      'review',
    );
    const key = {
      documentId: doc.id,
      pageNumber: resume.pageNumber,
      contentVersion: doc.contentVersion,
      style,
      kind: 'review' as const,
    };
    await this.lectures.seedSegments({
      documentId: doc.id,
      contentVersion: doc.contentVersion,
      generatorVersion: LECTURE_GENERATOR_VERSION,
      segments: [
        {
          topicId: resume.topicId,
          pageNumber: resume.pageNumber,
          seq: resume.seq,
          bridge: false,
          style,
          kind: 'review',
        },
      ],
    });
    await this.lectures.markSegmentWriting(
      doc.id,
      resume.pageNumber,
      doc.contentVersion,
      style,
      'review',
    );

    try {
      const written = await this.llm.lectureExtra({
        kind: 'review',
        topicTitle: plan.arc ? `${plan.hook}` : 'the chapter',
        style,
        styleDirection: LECTURE_STYLES[style].direction,
        terms: [],
        taught,
        payoff: plan.payoff ?? null,
        daysAway: Math.max(1, Math.floor(away / REVIEW_AFTER_MS)),
        budget: EXTRA_BUDGET.review,
      });
      await this.calls.record({
        documentId: doc.id,
        task: 'lecture_segment',
        model: written.usage.model,
        tokensIn: written.usage.tokensIn,
        tokensOut: written.usage.tokensOut,
        latencyMs: written.usage.latencyMs,
        outcome: 'ok',
      });
      const script = written.value.script.trim();
      await this.lectures.markSegmentWritten({
        ...key,
        scriptText: script,
        moveOffsets: [],
        durationMs: estimateDurationMs(scriptForTts(script)),
      });
      await this.queue.enqueueLectureVoices([{ ...key }]);
    } catch (error) {
      await this.lectures.markSegmentFailed({
        ...key,
        error: (error as Error).message,
      });
    }

    return finish();
  }
}

export interface LectureBoardRequest extends LectureRequest {
  pageNumber: number;
  kind?: SegmentKind;
}

/** One row's board and the word times it was timed on, once it is done. */
@Injectable()
export class LectureBoardHandler extends AbstractRequestHandlerTemplate<
  LectureBoardRequest,
  LectureBoardResponse
> {
  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: LectureBoardRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const segment = await this.lectures.findSegment(
      doc.id,
      cmd.pageNumber,
      doc.contentVersion,
      cmd.style ?? DEFAULT_LECTURE_STYLE,
      cmd.kind ?? 'page',
    );
    if (!segment || segment.boardStatus !== 'done' || !segment.board) {
      throw new NotFoundError('The board for this page');
    }
    return CommandResponse.of({
      board: segment.board,
      wordTimes: segment.wordTimes ?? null,
    } satisfies LectureBoardResponse);
  }
}

export interface LectureFollowRequest extends LectureRequest {
  pageNumber: number;
  kind?: SegmentKind;
}

/** One row's follow-along track, once it exists. */
@Injectable()
export class LectureFollowHandler extends AbstractRequestHandlerTemplate<
  LectureFollowRequest,
  LectureFollowResponse
> {
  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: LectureFollowRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const segment = await this.lectures.findSegment(
      doc.id,
      cmd.pageNumber,
      doc.contentVersion,
      cmd.style ?? DEFAULT_LECTURE_STYLE,
      cmd.kind ?? 'page',
    );
    if (!segment || segment.followStatus !== 'done' || !segment.follow) {
      throw new NotFoundError('The follow-along track for this page');
    }
    return CommandResponse.of({
      track: segment.follow,
    } satisfies LectureFollowResponse);
  }
}

export interface BackfillBoardsRequest extends LectureRequest {
  topicIds?: string[];
}

/**
 * Boards for a lecture written before boards existed, or whose boards
 * failed. Scripts and audio are untouched; one job per row goes out and
 * the status answers as it does for any generation.
 */
@Injectable()
export class BackfillBoardsHandler extends AbstractRequestHandlerTemplate<
  BackfillBoardsRequest,
  LectureStatusResponse
> {
  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
    private readonly status: LectureStatusHandler,
  ) {
    super();
  }

  protected async handleRequest(cmd: BackfillBoardsRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const style = cmd.style ?? DEFAULT_LECTURE_STYLE;
    const rows = await this.lectures.listForBoardBackfill(
      doc.id,
      doc.contentVersion,
      cmd.topicIds?.length ? cmd.topicIds : null,
    );
    const wanted = rows.filter(
      (row) =>
        row.style === style &&
        row.scriptText &&
        (row.boardStatus === 'none' ||
          row.boardStatus === 'failed' ||
          !boardIsCurrent(row.board as BoardTimeline | null)),
    );
    await this.queue.enqueueLectureBoards(
      wanted.map((row) => ({
        documentId: doc.id,
        contentVersion: doc.contentVersion,
        pageNumber: row.pageNumber,
        style,
        kind: row.kind,
      })),
    );
    const { data } = await this.status.handle({ ...cmd, style });
    return CommandResponse.of(data);
  }
}
