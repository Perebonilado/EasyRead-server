import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LectureStyle } from '../../contracts';
import { EVENT_BUS, JOB_QUEUE, LLM_GATEWAY } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type {
  JobQueuePort,
  LectureVoiceJob,
} from '../../business/ports/job-queue.port';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
  LectureRepository,
  LectureSegmentRecord,
} from '../../business/repositories/lecture.repository';
import type { TopicRepository } from '../../business/repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import type { Block } from '../../contracts';
import {
  noteLevelFor,
  noteNumbered,
  noteProse,
} from '../../business/domain/follow';
import {
  LECTURE_GENERATOR_VERSION,
  LECTURE_STYLES,
  MAX_SEGMENT_ATTEMPTS,
  WORD_BUDGET,
  acceptSegment,
  beatFor,
  estimateDurationMs,
  hookProblems,
  hookShapeFor,
  listShape,
  openingsBefore,
  outlineCorrection,
  scriptForTts,
  sectionProblems,
  sectionsToScript,
  singleTurn,
  styleProblems,
  tailOf,
  taughtLines,
  unsupportedFigures,
  validateOutline,
  EXTRA_BUDGET,
  pageScripts,
  shouldSplit,
  type LectureExtraKind,
  type PageScripts,
  type BeatWeight,
  type LectureBeat,
  type LectureSection,
  type LecturePlan,
  type VerifyResult,
  withoutBoardMarkers,
  markLabelProblems,
  readsAsApplause,
  type PageBoard,
} from '../../business/domain/lecture';
import type { LectureChapterJobData } from '../queues';
import type { JobContext } from './base.processor';
import { LectureBoardService } from './lecture-board.service';
import {
  capFigures,
  fittedMeaning,
  fittedText,
  listsFromRuns,
  mergePlanLines,
  nextFreeLine,
  planProblems,
  type PlanLineDraft,
} from '../../business/domain/board';

/** How much of a neighbouring page the verifier is shown. */
const NEIGHBOUR_CHARS = 2_500;

/** How many earlier chapters' lines the writer is reminded of. */
const TAUGHT_EARLIER_FOR_WRITER = 12;
const TAUGHT_SO_FAR_MAX = 20;
const COMING_LATER_MAX = 15;

/** A page neighbouring the one being checked, as the verifier sees it. */
interface NeighbourPage {
  pageNumber: number;
  text: string;
}

interface PageText {
  pageNumber: number;
  text: string;
}

/** A finished page: the words, and where each of its ideas begins. */
type WrittenPage = PageScripts;

/**
 * One chapter's lecture, in one style: planned once, then written page by
 * page IN ORDER.
 *
 * The order is the whole point. Each page is written knowing the tail of
 * the page before it, which is what makes a lecture rather than a stack
 * of summaries — so pages inside a chapter can never run concurrently.
 * Chapters run alongside each other instead, which is where the
 * parallelism lives. Synthesis is handed to its own queue so a chapter
 * keeps writing while its earlier pages are being voiced.
 *
 * The plan (hook, arc, payoff, beats and their moves) is shared by every
 * style of the lecture; only the words differ. That is what lets a
 * learner switch style mid-chapter and land on the same idea. A job may
 * start mid-chapter for exactly that reason: a learner is waiting there.
 *
 * Two things the prompts could not make the writer do are done here in
 * code: the chapter's opening is the planner's hook spoken word for word
 * (the writer only continues from it), and a page that opens with a tic,
 * runs long, ends on a recap, or ignores its moves is sent back with the
 * reason.
 */
@Injectable()
export class LectureChapterProcessor {
  private readonly logger = new Logger(LectureChapterProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly boards: LectureBoardService,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
  ) {}

  /**
   * The simplified note a style teaches from (the slow learner's from the
   * easiest note), or null when it is not written yet, in which case the
   * page's own text stands in.
   */
  private async noteFor(
    documentId: string,
    pageNumber: number,
    style: LectureStyle,
  ): Promise<Block[] | null> {
    const wanted = noteLevelFor(style);
    const other = wanted === 'easiest' ? 'standard' : 'easiest';
    for (const level of [wanted, other] as const) {
      const page = await this.simplified.find(documentId, level, pageNumber);
      if (page?.status === 'done' && page.blocks?.length) return page.blocks;
    }
    return null;
  }

  async process(
    job: LectureChapterJobData,
    context: JobContext,
  ): Promise<void> {
    const { documentId, topicId, contentVersion, orderIndex, startAtPage } =
      job;
    const style: LectureStyle = job.style ?? 'steady';

    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;

    const topics = await this.topics.listByDocument(documentId);
    const topic = topics.find((candidate) => candidate.id === topicId);
    if (!topic) return;

    // Every row of every style: the rows were seeded when the lecture was
    // asked for, so the shape of the whole lecture is visible before any
    // model call is made, and the other styles' pages are the fallback
    // for continuity when this style starts mid-chapter.
    const all = await this.lectures.listSegments(documentId, contentVersion);
    const mine = all.filter(
      (row) => row.topicId === topicId && row.style === style,
    );
    const rows = mine.filter((row) => row.kind === 'page');
    // The short segments this style gets around the chapter (the words
    // before it, the check after it), written from the plan.
    const extras = mine.filter((row) => row.kind !== 'page');
    if (!rows.length) return;

    // Rows that have their words but not their audio: a voice job that
    // failed and was put back to pending, or one lost while a worker was
    // restarted. The words are kept and only the voicing is asked for
    // again; the queue ignores a duplicate of a job it is still running.
    const unvoiced = mine.filter(
      (row) =>
        row.scriptText && row.status !== 'done' && row.status !== 'failed',
    );
    if (unvoiced.length) {
      const keys = unvoiced.map((row) => ({
        documentId,
        contentVersion,
        pageNumber: row.pageNumber,
        style,
        kind: row.kind,
      }));
      await this.queue.enqueueLectureVoices(keys);
      // Their words exist, so their board can be written now; it is timed
      // on the audio once that arrives.
      const unboarded = keys.filter((key, index) => {
        const status = unvoiced[index].boardStatus ?? 'none';
        return (
          this.boards.enabled() && (status === 'none' || status === 'failed')
        );
      });
      if (unboarded.length) {
        await this.queue.enqueueLectureBoards(unboarded);
      }
    }

    // How the chapters before this one began, in this style, so this one
    // begins differently. Chapters are written alongside each other, so
    // early in a lecture this is often empty and the rotating shape
    // carries the variety alone.
    const sameStyle = all.filter(
      (row) => row.style === style && row.kind === 'page',
    );
    const priorOpenings = openingsBefore(sameStyle, rows[0].seq);
    const lectured = new Set(
      all
        .filter((row) => row.scriptText && row.topicId && row.kind === 'page')
        .map((row) => row.topicId as string),
    );

    // What the chapters before this one taught, for the planner (to build
    // on) and the writer (not to teach again). A chapter still being
    // planned alongside this one contributes its description instead.
    const plans = await this.lectures.listPlans(documentId, contentVersion);
    const planOf = new Map<string, LecturePlan>();
    for (const record of plans) {
      if (record.status === 'done' && record.plan) {
        planOf.set(record.topicId, record.plan as LecturePlan);
      }
    }
    const taughtEarlier = taughtLines(
      topics
        .filter((candidate) => candidate.startPage < topic.startPage)
        .sort((a, b) => a.startPage - b.startPage)
        .map((candidate) => ({
          title: candidate.title,
          shortDescription: candidate.shortDescription ?? null,
          plan: planOf.get(candidate.id) ?? null,
        })),
    );

    const plan = await this.ensurePlan({
      doc,
      topic,
      rows,
      contentVersion,
      orderIndex,
      priorOpenings,
      taughtEarlier,
      lectured,
      context,
    });
    if (!plan) {
      // Nothing can be written without a plan. Saying so page by page is
      // what lets the player and the chapter list stop waiting.
      await this.failUnwritten(
        doc.id,
        [...rows, ...extras],
        contentVersion,
        style,
        'The chapter could not be planned',
      );
      return;
    }

    // A slow learner hears the chapter's words before its first page, so
    // they are written first: one short call, then the page they wait on.
    await this.writeExtra({
      doc,
      topic,
      plan,
      rows,
      extras,
      style,
      contentVersion,
      kind: 'terms',
    });

    // A learner who switched style mid-chapter is waiting at startAtPage:
    // that page and the rest of the chapter go first, the earlier pages
    // are filled in after.
    const from = startAtPage
      ? rows.findIndex((row) => row.pageNumber === startAtPage)
      : -1;
    const ordered =
      from > 0 ? [...rows.slice(from), ...rows.slice(0, from)] : rows;

    for (const row of ordered) {
      // Resume-safe: a chapter retried by the queue picks up where it
      // stopped. The script's existence is the idempotency key, not the
      // status, because a written page legitimately sits in `voicing`.
      if (row.scriptText) continue;
      await this.writeOne({
        doc,
        topicId: topic.id,
        topicTitle: topic.title,
        plan,
        row,
        rows,
        all,
        contentVersion,
        style,
        taughtEarlier,
      });
    }

    // The check of what stuck, after the chapter's last page.
    await this.writeExtra({
      doc,
      topic,
      plan,
      rows,
      extras,
      style,
      contentVersion,
      kind: 'check',
    });
  }

  /**
   * One of the short segments around the chapter, written from the plan:
   * the words a slow learner hears first, or the check of what stuck.
   * Every line comes from the plan, so there is no page to verify it
   * against. A chapter with nothing to check, or a plan from before terms
   * existed, fails the row with the reason; the player skips a failed
   * extra silently, since nothing of the lecture is missing.
   */
  private async writeExtra(input: {
    doc: { id: string };
    topic: { title: string };
    plan: LecturePlan;
    rows: LectureSegmentRecord[];
    extras: LectureSegmentRecord[];
    style: LectureStyle;
    contentVersion: number;
    kind: LectureExtraKind;
  }): Promise<void> {
    const { doc, plan, style, contentVersion, kind } = input;
    const row = input.extras.find((extra) => extra.kind === kind);
    if (!row || row.scriptText) return;
    const key = {
      documentId: doc.id,
      pageNumber: row.pageNumber,
      contentVersion,
      style,
      kind,
    };
    const fail = async (error: string) => {
      await this.lectures.markSegmentFailed({ ...key, error });
      await this.events.publish(doc.id, {
        type: 'lecture.segment_failed',
        pageNumber: row.pageNumber,
        style,
        kind,
      });
    };

    const terms = plan.terms ?? [];
    const taught = input.rows
      .filter((page) => !page.bridge)
      .map((page) => {
        const beat = beatFor(plan, page.pageNumber);
        return beat.newHere?.trim() || beat.goal;
      });
    if (kind === 'terms' && !terms.length) {
      await fail('The chapter plan names no terms');
      return;
    }
    if (kind !== 'terms' && !taught.length) {
      await fail('The chapter taught nothing to check');
      return;
    }

    try {
      await this.lectures.markSegmentWriting(
        doc.id,
        row.pageNumber,
        contentVersion,
        style,
        kind,
      );
      const written = await this.llm.lectureExtra({
        kind,
        topicTitle: input.topic.title,
        style,
        styleDirection: LECTURE_STYLES[style].direction,
        terms,
        taught,
        payoff: plan.payoff ?? null,
        daysAway: null,
        budget: EXTRA_BUDGET[kind],
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
      row.scriptText = script;
      await this.lectures.markSegmentWritten({
        ...key,
        scriptText: script,
        moveOffsets: [],
        durationMs: estimateDurationMs(scriptForTts(script)),
      });
      await this.boards.writeForExtra({
        key: {
          documentId: doc.id,
          contentVersion,
          pageNumber: row.pageNumber,
          style,
          kind,
        },
        script,
        topicTitle: input.topic.title,
        plan,
        durationMs: estimateDurationMs(scriptForTts(script)),
      });
      await this.queue.enqueueLectureVoices([
        {
          documentId: doc.id,
          contentVersion,
          pageNumber: row.pageNumber,
          style,
          kind,
        },
      ]);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${input.topic.title}: ${kind} failed (${message})`);
      await fail(message);
    }
  }

  /** Writes the chapter's plan once, or reuses the one already stored. */
  private async ensurePlan(input: {
    doc: { id: string; props: { title: string } };
    topic: { id: string; title: string; startPage: number };
    rows: LectureSegmentRecord[];
    contentVersion: number;
    orderIndex: number;
    priorOpenings: string[];
    taughtEarlier: string[];
    /** Chapters that already have spoken words, wherever they sit. */
    lectured: Set<string>;
    context: JobContext;
  }): Promise<LecturePlan | null> {
    const { doc, topic, rows, contentVersion, context } = input;
    const existing = await this.lectures.findPlan(
      doc.id,
      topic.id,
      contentVersion,
    );
    // A plan from an earlier generator lacks what this one teaches from
    // (terms, the turn, pitfalls). It is planned again while nothing has
    // been spoken from it; once a style has words, the plan stays, because
    // the pages' ideas are cut to it and a switch between styles lands on
    // those.
    const stale =
      existing?.generatorVersion !== undefined &&
      existing.generatorVersion !== LECTURE_GENERATOR_VERSION &&
      !input.lectured.has(topic.id);
    if (existing?.status === 'done' && existing.plan && !stale) {
      return existing.plan as LecturePlan;
    }
    if (stale) {
      this.logger.log(
        `${topic.title}: plan from ${existing?.generatorVersion} is planned again under ${LECTURE_GENERATOR_VERSION}`,
      );
    }

    const pageNumbers = rows.map((row) => row.pageNumber);
    const pageRows = await this.pages.findRange(
      doc.id,
      pageNumbers[0],
      pageNumbers[pageNumbers.length - 1],
    );
    // The planner reads the note when it exists, its blocks numbered so a
    // move can name the blocks it teaches; the raw page otherwise.
    const pages: PageText[] = [];
    for (const page of pageRows) {
      if (!pageNumbers.includes(page.pageNumber)) continue;
      // The plan is shared by every style, so it reads the standard note.
      const note = await this.noteFor(doc.id, page.pageNumber, 'steady');
      pages.push({
        pageNumber: page.pageNumber,
        text: note
          ? `(blocks numbered)\n${noteNumbered(note)}`.slice(0, 4_000)
          : page.text.slice(0, 4_000),
      });
    }

    // Everything before this chapter in the document. The student may have
    // read any of it; what they have HEARD is marked, so a callback can
    // say "as I said" only where something was said.
    const priorTopics = (await this.topics.listByDocument(doc.id))
      .filter((candidate) => candidate.startPage < topic.startPage)
      .sort((a, b) => a.startPage - b.startPage)
      .map((candidate) =>
        input.lectured.has(candidate.id)
          ? `${candidate.title} (already lectured)`
          : candidate.title,
      );

    const outlineInput = {
      title: doc.props.title,
      topicTitle: topic.title,
      pages,
      priorTopics,
      priorOpenings: input.priorOpenings,
      suggestedShape: hookShapeFor(input.orderIndex, priorTopics.length > 0),
      taughtEarlier: input.taughtEarlier,
    };
    // A chapter of figures and dividers has nothing to check a hook against.
    const checkable = rows.some((row) => !row.bridge);

    try {
      let result = await this.llm.lectureOutline(outlineInput);
      let problems = validateOutline(result.value, pageNumbers);
      // The hook is spoken word for word, so it is checked against the
      // material like any other line, once the plan holds together.
      let hookVerdict =
        problems.length || !checkable
          ? null
          : await this.verifyHook(doc.id, result.value, pages);

      if (problems.length || hookVerdict?.grounded === false) {
        // A plan with a hole in it becomes a lecture the student hears as
        // a jump; a hook that opens with "Imagine" would be spoken. One
        // rewrite, told exactly why, is cheaper than shipping either.
        const correction = [
          outlineCorrection(problems),
          hookVerdict?.grounded === false
            ? `The hook says something the chapter does not support: ${hookVerdict.problems.join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('; ');
        this.logger.warn(`${topic.title}: plan rejected (${correction})`);
        result = await this.llm.lectureOutline({ ...outlineInput, correction });
        problems = validateOutline(result.value, pageNumbers);
        hookVerdict = checkable
          ? await this.verifyHook(doc.id, result.value, pages)
          : null;
      }

      // If the hook still cannot be spoken as written, the writer opens
      // the chapter itself, under the same style checks. Never block a
      // chapter on its first sentence.
      const hookSpoken =
        hookProblems(problems).length === 0 && hookVerdict?.grounded !== false;
      if (!hookSpoken) {
        this.logger.warn(
          `${topic.title}: hook not fit to be spoken word for word; the writer opens the chapter`,
        );
      }
      const plan: LecturePlan = {
        ...result.value,
        beats: capFigures(singleTurn(result.value.beats)),
        hookSpoken,
      };

      await this.calls.record({
        documentId: doc.id,
        task: 'lecture_outline',
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.usage.latencyMs,
        outcome: 'ok',
      });
      await this.lectures.savePlan({
        documentId: doc.id,
        topicId: topic.id,
        contentVersion,
        status: 'done',
        plan,
        generatorVersion: LECTURE_GENERATOR_VERSION,
      });
      return plan;
    } catch (error) {
      const message = (error as Error).message;
      if (!context.isFinalAttempt) throw error;
      await this.lectures.savePlan({
        documentId: doc.id,
        topicId: topic.id,
        contentVersion,
        status: 'failed',
        plan: null,
        generatorVersion: LECTURE_GENERATOR_VERSION,
        error: message,
      });
      await this.calls.record({
        documentId: doc.id,
        task: 'lecture_outline',
        model: 'unknown',
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        outcome: 'failed',
      });
      return null;
    }
  }

  /**
   * The hook checked against the chapter's opening page, with the rest of
   * the chapter alongside: it was planned from all of them.
   */
  private async verifyHook(
    documentId: string,
    plan: LecturePlan,
    pages: PageText[],
  ): Promise<VerifyResult | null> {
    const [first, ...others] = pages;
    if (!first) return null;
    const verdict = await this.llm.lectureVerify({
      script: plan.hook,
      pageText: first.text,
      context: {
        plan: describePlan(plan, beatFor(plan, first.pageNumber)),
        prevTail: '',
        neighbours: others.slice(0, 3).map((page) => ({
          pageNumber: page.pageNumber,
          text: page.text.slice(0, NEIGHBOUR_CHARS),
        })),
      },
    });
    await this.recordVerify(documentId, verdict.usage);
    return verdict.value;
  }

  /**
   * One page: written inside the plan, checked against its source, and
   * handed to the voice queue. A page that cannot be written fails alone
   * — the rest of the chapter still gets a lecture.
   */
  private async writeOne(input: {
    doc: { id: string };
    topicId: string;
    topicTitle: string;
    plan: LecturePlan;
    row: LectureSegmentRecord;
    /** This chapter's rows in this style, in play order. */
    rows: LectureSegmentRecord[];
    /** Every row of the document, all styles, for continuity fallbacks. */
    all: LectureSegmentRecord[];
    contentVersion: number;
    style: LectureStyle;
    taughtEarlier: string[];
  }): Promise<void> {
    const { doc, plan, row, rows, contentVersion, style } = input;
    await this.lectures.markSegmentWriting(
      doc.id,
      row.pageNumber,
      contentVersion,
      style,
    );

    try {
      const page = await this.pages.findOne(doc.id, row.pageNumber);
      // The note is what the lecturer teaches from and what the reader
      // follows; the page itself stands in until the note is written, and
      // stays beside the verifier so nothing true is flagged.
      const note = await this.noteFor(doc.id, row.pageNumber, style);
      const original = (page?.text ?? '').slice(0, 6_000);
      const pageText = note ? noteProse(note).slice(0, 6_000) : original;

      // The nearest EARLIER page that actually has words, in this style.
      // Pages the lecture skipped, and pages that failed, leave gaps. When
      // this style is being written from the middle of the chapter, the
      // page before it exists only in the style the learner was listening
      // to, and its tail is exactly the last thing they heard.
      const previous =
        rows.filter((other) => other.seq < row.seq && other.scriptText).pop() ??
        input.all
          .filter(
            (other) =>
              other.kind === 'page' &&
              other.topicId === row.topicId &&
              other.seq < row.seq &&
              other.scriptText,
          )
          .sort((a, b) => a.seq - b.seq)
          .pop();
      // A page voiced as two pieces: the last thing heard is its second.
      const previousPart = previous
        ? input.all.find(
            (other) =>
              other.kind === 'part' &&
              other.pageNumber === previous.pageNumber &&
              other.style === previous.style &&
              other.scriptText,
          )
        : undefined;
      const heardLast = previousPart ?? previous;

      // The pages either side of this one in the chapter, for the
      // verifier. A fact the writer took from the plan or the page before
      // is on one of them far more often than it is invented.
      const index = rows.indexOf(row);
      const neighbours = await this.neighbourPages(doc.id, [
        rows[index - 1],
        rows[index + 1],
      ]);

      const isFirstOfTopic = index === 0;
      // The opening is spoken word for word from the plan; the writer
      // continues from it. Unless the planner could not produce one fit to
      // be spoken, in which case the writer opens the chapter itself.
      const opening =
        isFirstOfTopic && plan.hookSpoken !== false ? plan.hook.trim() : null;

      // What the lecture has taught (this chapter first, then earlier
      // ones) and what this chapter still has coming, so the page spends
      // its words on what is new here.
      const lineFor = (beat: LectureBeat) => beat.newHere?.trim() || beat.goal;
      const taughtSoFar = [
        ...rows
          .slice(0, index)
          .map((earlier) => lineFor(beatFor(plan, earlier.pageNumber))),
        ...input.taughtEarlier.slice(0, TAUGHT_EARLIER_FOR_WRITER),
      ].slice(0, TAUGHT_SO_FAR_MAX);
      const comingLater = rows
        .slice(index + 1)
        .map((later) => beatFor(plan, later.pageNumber).goal)
        .slice(0, COMING_LATER_MAX);

      const written = await this.writeChecked({
        documentId: doc.id,
        topicTitle: input.topicTitle,
        plan,
        style,
        pageNumber: row.pageNumber,
        pageText,
        prevTail: heardLast?.scriptText
          ? tailOf(heardLast.scriptText, LECTURE_STYLES[style].tailChars)
          : '',
        isFirstOfTopic,
        isLastOfTopic: index === rows.length - 1,
        pageIndex: index,
        pageCount: rows.length,
        bridge: row.bridge,
        opening,
        taughtSoFar,
        comingLater,
        list: listShape(pageText),
        neighbours,
        original: note ? original : undefined,
      });

      // Kept in memory too, so the next page in this loop sees it without
      // a round trip to the database.
      row.scriptText = written.script;
      row.moveOffsets = written.moveOffsets;

      await this.lectures.markSegmentWritten({
        documentId: doc.id,
        pageNumber: row.pageNumber,
        contentVersion,
        style,
        scriptText: written.script,
        moveOffsets: written.moveOffsets,
        durationMs: estimateDurationMs(scriptForTts(written.script)),
      });

      // The board for this page, from the accepted script. It can never
      // fail the page: the page is written; the board is a bonus.
      const pageKey = {
        documentId: doc.id,
        contentVersion,
        pageNumber: row.pageNumber,
        style,
        kind: 'page' as const,
      };
      // A page whose board was planned before the speech needs no second
      // writer: the board comes from the plan and the marks. A page with
      // no plan keeps the older way, a board written from the words.
      const pageBoard = written.board?.lines.length
        ? await this.boards.writeFromMarkers({
            key: pageKey,
            script: written.script,
            pageText,
            plan,
            beat: beatFor(plan, row.pageNumber),
            durationMs: estimateDurationMs(scriptForTts(written.script)),
            continues: false,
            sections: written.sections,
            board: written.board,
          })
        : await this.boards.writeForPage({
            key: pageKey,
            script: written.script,
            pageText,
            topicTitle: input.topicTitle,
            plan,
            beat: beatFor(plan, row.pageNumber),
            durationMs: estimateDurationMs(scriptForTts(written.script)),
            continues: false,
            bridge: row.bridge,
            moveOffsets: written.moveOffsets,
          });
      if (pageBoard && this.boards.figureFor(plan, row.pageNumber)) {
        await this.boards.requestDiagram({
          ...pageKey,
          topicId: input.topicId,
        });
      }

      const voices: LectureVoiceJob[] = [
        {
          documentId: doc.id,
          contentVersion,
          pageNumber: row.pageNumber,
          style,
        },
      ];
      if (written.part) {
        // The second piece: its own row on the same page, its own file.
        // Seeded here rather than with the pages, because whether a page
        // runs long is only known once it is written.
        await this.lectures.seedSegments({
          documentId: doc.id,
          contentVersion,
          generatorVersion: LECTURE_GENERATOR_VERSION,
          segments: [
            {
              topicId: input.topicId,
              pageNumber: row.pageNumber,
              seq: row.seq,
              bridge: false,
              style,
              kind: 'part',
            },
          ],
        });
        await this.lectures.markSegmentWritten({
          documentId: doc.id,
          pageNumber: row.pageNumber,
          contentVersion,
          style,
          kind: 'part',
          scriptText: written.part.script,
          moveOffsets: written.part.moveOffsets,
          durationMs: estimateDurationMs(scriptForTts(written.part.script)),
        });
        // The second piece continues the page's board on the next free line.
        if (written.part.board?.lines.length) {
          await this.boards.writeFromMarkers({
            key: { ...pageKey, kind: 'part' },
            script: written.part.script,
            pageText,
            plan,
            beat: beatFor(plan, row.pageNumber),
            durationMs: estimateDurationMs(scriptForTts(written.part.script)),
            continues: true,
            startLine: pageBoard ? nextFreeLine(pageBoard) : 1,
            sections: written.part.sections,
            board: written.part.board,
          });
        } else {
          await this.boards.writeForPage({
            key: { ...pageKey, kind: 'part' },
            script: written.part.script,
            pageText,
            topicTitle: input.topicTitle,
            plan,
            beat: beatFor(plan, row.pageNumber),
            durationMs: estimateDurationMs(scriptForTts(written.part.script)),
            continues: true,
            bridge: false,
            startLine: pageBoard ? nextFreeLine(pageBoard) : 1,
            moveOffsets: written.part.moveOffsets,
          });
        }
        // In memory too: the next page continues from this piece.
        input.all.push({
          ...row,
          kind: 'part',
          status: 'voicing',
          scriptText: written.part.script,
          moveOffsets: written.part.moveOffsets,
        });
        voices.push({
          documentId: doc.id,
          contentVersion,
          pageNumber: row.pageNumber,
          style,
          kind: 'part',
        });
      }
      await this.queue.enqueueLectureVoices(voices);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(
        `${doc.id} p${row.pageNumber} ${style} lecture script failed — ${message}`,
      );
      await this.lectures.markSegmentFailed({
        documentId: doc.id,
        pageNumber: row.pageNumber,
        contentVersion,
        style,
        error: message,
      });
      await this.calls.record({
        documentId: doc.id,
        task: 'lecture_segment',
        model: 'unknown',
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        outcome: 'failed',
      });
      await this.events.publish(doc.id, {
        type: 'lecture.segment_failed',
        pageNumber: row.pageNumber,
        style,
      });
    }
  }

  /**
   * Writes the segment and sends it back while it needs to be: for how it
   * reads (a banned opener, a throat-clearing start, too many words, a
   * recap ending, sections that ignore the moves) and for what it claims,
   * while attempts remain. The last attempt is written strictly from the
   * page when the material was left before, and is then kept unless it
   * carries a figure the material does not contain: the verifier's word
   * alone no longer makes a hole.
   */
  private async writeChecked(input: {
    documentId: string;
    topicTitle: string;
    plan: LecturePlan;
    style: LectureStyle;
    pageNumber: number;
    pageText: string;
    prevTail: string;
    isFirstOfTopic: boolean;
    isLastOfTopic: boolean;
    pageIndex: number;
    pageCount: number;
    bridge: boolean;
    opening: string | null;
    taughtSoFar: string[];
    comingLater: string[];
    list: { items: number } | null;
    neighbours: NeighbourPage[];
    /** The page's own text when the note stood in for it, for the verifier. */
    original?: string;
  }): Promise<WrittenPage> {
    const { style } = input;
    const beat = beatFor(input.plan, input.pageNumber);
    const weight: BeatWeight = beat.weight ?? 'full';
    // A bridge is one sentence whatever the plan says; a plan from before
    // moves existed has one move, the page's goal.
    // A plan sometimes ends a page on applause ("encouragement to continue
    // learning"); that is not a move, and the page is written without it.
    const taught = (beat.moves ?? []).filter((move) => !readsAsApplause(move));
    const applause = (beat.moves ?? []).filter((move) => readsAsApplause(move));
    if (applause.length) {
      this.logger.log(
        `${input.documentId} p${input.pageNumber} ${style}: left out the plan's applause move${applause.length === 1 ? '' : 's'} ${applause.map((move) => `"${move}"`).join(', ')}`,
      );
    }
    const moves = input.bridge
      ? [beat.goal]
      : taught.length
        ? taught
        : [beat.goal];
    const spec = LECTURE_STYLES[style];
    const budget = WORD_BUDGET[style][weight];
    const planText = describePlan(input.plan, beat);
    // Everything a figure in the script may legitimately come from.
    const sources = [
      input.pageText,
      input.original ?? '',
      ...input.neighbours.map((page) => page.text),
      planText,
      input.prevTail,
    ];
    let correction: string | undefined;
    let styleCorrection: string | undefined;
    let leftTheMaterial = false;

    // The board first, so the speech can be written around it: the
    // lecturer knows what goes on the board before saying a word.
    const board = input.bridge
      ? null
      : await this.planBoard({
          documentId: input.documentId,
          topicTitle: input.topicTitle,
          plan: input.plan,
          beat,
          moves,
          style,
          pageText: input.pageText,
        });

    // The attempt with the fewest style faults, kept in case the last one
    // is worse: the rule loop must never trade a good page for a thin one.
    let best: { sections: LectureSection[]; faults: number } | null = null;
    for (let attempt = 1; ; attempt += 1) {
      // Strict mode flattens a page to what it literally says. That is the
      // right answer to a page that has left the material, and the wrong
      // answer to one that merely opened with "Imagine".
      const strict = attempt >= MAX_SEGMENT_ATTEMPTS && leftTheMaterial;
      const written = await this.llm.lectureSegment({
        topicTitle: input.topicTitle,
        hook: input.plan.hook,
        arc: input.plan.arc,
        beat: {
          goal: beat.goal,
          callback: beat.callback ?? null,
          foreshadow: beat.foreshadow ?? null,
          newHere: beat.newHere ?? null,
          skip: beat.skip ?? null,
          weight,
          moves,
          pitfall: beat.pitfall ?? null,
          turn: beat.turn === true,
        },
        problem: input.isFirstOfTopic ? (input.plan.problem ?? null) : null,
        pageIndex: input.pageIndex,
        pageCount: input.pageCount,
        style,
        styleDirection: spec.direction,
        budget: { min: budget.min, max: budget.max },
        pageText: input.pageText,
        prevTail: input.prevTail,
        isFirstOfTopic: input.isFirstOfTopic,
        isLastOfTopic: input.isLastOfTopic,
        bridge: input.bridge,
        payoff: input.plan.payoff ?? null,
        opening: input.opening,
        taughtSoFar: input.taughtSoFar,
        comingLater: input.comingLater,
        list: input.list,
        board: board
          ? {
              heading: board.heading ?? '',
              lines: board.lines.map((line) => ({
                number: line.number,
                move: line.move,
                kind: line.kind,
                text: line.text,
                meaning: line.meaning,
              })),
            }
          : null,
        correction,
        styleCorrection,
        strict,
      });

      await this.calls.record({
        documentId: input.documentId,
        task: 'lecture_segment',
        model: written.usage.model,
        tokensIn: written.usage.tokensIn,
        tokensOut: written.usage.tokensOut,
        latencyMs: written.usage.latencyMs,
        outcome: 'ok',
      });

      let sections = written.value.sections;
      const continuation = sectionsToScript(sections);
      // The board marks are for the board; the style checks and the
      // verifier read the words as the listener will hear them.
      const plainContinuation = withoutBoardMarkers(continuation);

      // A page that reads badly, or that ignored its moves, goes straight
      // back while there are attempts left: no verifier call is spent on
      // words we will not keep.
      const style_ = [
        ...sectionProblems(sections, moves),
        ...markLabelProblems(sections, board),
        ...styleProblems(plainContinuation, {
          style,
          weight,
          bridge: input.bridge,
          sections: sections.map((section) => ({
            ...section,
            text: withoutBoardMarkers(section.text),
          })),
          // The plan's own words are the page's too, for the plain-words gate.
          pageText: `${input.pageText} ${planText}`,
          terms: (input.plan.terms ?? []).map((entry) => entry.term),
          taughtSoFar: input.taughtSoFar,
        }),
      ];
      // A page that ignored its moves cannot stand in for one that kept
      // them; among the rest, fewer faults is better.
      const structural = style_.some(
        (problem) => problem.kind === 'moves' || problem.kind === 'label',
      );
      if (!structural && (best === null || style_.length < best.faults)) {
        best = { sections, faults: style_.length };
      }
      if (style_.length && attempt < MAX_SEGMENT_ATTEMPTS) {
        styleCorrection = style_.map((problem) => problem.detail).join('; ');
        correction = undefined;
        continue;
      }
      if (style_.length && best !== null && best.faults < style_.length) {
        this.logger.log(
          `${input.documentId} p${input.pageNumber} ${style}: keeping an earlier attempt with ${best.faults} style fault${best.faults === 1 ? '' : 's'} over the last with ${style_.length}`,
        );
        sections = best.sections;
      }

      const chosen = withoutBoardMarkers(sectionsToScript(sections));
      // A one-line bridge has almost nothing to be unfaithful to, and the
      // check would cost a model call per figure page.
      const verdict = input.bridge
        ? { grounded: true, problems: [] }
        : await this.verifySegment(input.documentId, chosen, {
            plan: planText,
            prevTail: input.prevTail,
            neighbours: input.original
              ? [
                  {
                    pageNumber: input.pageNumber,
                    text: input.original.slice(0, NEIGHBOUR_CHARS),
                  },
                  ...input.neighbours,
                ]
              : input.neighbours,
            pageText: input.pageText,
          });
      const figures = input.bridge ? [] : unsupportedFigures(chosen, sources);

      const decision = acceptSegment(chosen, verdict, attempt, style_, figures);
      if (decision.action === 'accept') {
        if (decision.warning) {
          this.logger.warn(
            `${input.documentId} p${input.pageNumber} ${style}: kept despite style (${decision.warning})`,
          );
        }
        // A slow learner's long page is voiced as two pieces, one idea
        // each, cut at the move boundary nearest the middle.
        return pageScripts(
          input.opening,
          sections,
          shouldSplit(style, weight, sections),
          board,
        );
      }
      if (decision.action === 'fail') {
        throw new Error(`Script left the page: ${decision.reason}`);
      }
      correction = decision.reason;
      styleCorrection = undefined;
      leftTheMaterial = true;
    }
  }

  /**
   * The board for a page, planned from the page and its moves before the
   * speech exists. The rules that do not need the spoken words run on it;
   * a plan that breaks them is asked for once more, and the lines still
   * refused are left off. A planner that fails costs the page nothing:
   * the board is written from the words afterwards, the older way.
   */
  private async planBoard(input: {
    documentId: string;
    topicTitle: string;
    plan: LecturePlan;
    beat: LectureBeat;
    moves: string[];
    style: LectureStyle;
    pageText: string;
  }): Promise<PageBoard | null> {
    if (!this.boards.enabled()) return null;
    const { beat } = input;
    const request = {
      topicTitle: input.topicTitle,
      pageText: input.pageText,
      goal: beat.goal,
      newHere: beat.newHere ?? null,
      pitfall: beat.pitfall ?? null,
      moves: input.moves,
      terms: input.plan.terms ?? [],
      style: input.style,
      light: beat.weight === 'light',
    };
    const ctx = {
      pageText: input.pageText,
      planLines: [
        beat.goal,
        beat.newHere ?? '',
        ...(input.plan.terms ?? []).map(
          (entry) => `${entry.term} ${entry.meaning}`,
        ),
      ],
      moves: input.moves,
      style: input.style,
    };
    try {
      const raw = await this.llm.lectureBoardPlan(request);
      await this.recordBoardCall(input.documentId, raw.usage);
      // Judged as the board will write them: a "figure" with no number is
      // a point, a point carries no meaning, a line is fitted to its line.
      const asWritten = (line: PlanLineDraft): PlanLineDraft => {
        const kind =
          line.kind === 'figure' && !/[\d=+*/^%]/.test(line.text)
            ? 'point'
            : line.kind;
        return {
          ...line,
          kind,
          text: fittedText(kind, line.text.trim()),
          meaning:
            kind === 'term' && line.meaning?.trim()
              ? fittedMeaning(line.meaning.trim())
              : null,
        };
      };
      const planned = {
        ...raw,
        value: { ...raw.value, lines: raw.value.lines.map(asWritten) },
      };
      const problems = planProblems(planned.value, ctx);
      const badOf = (list: { index?: number }[]) =>
        new Set(
          list
            .filter((problem) => problem.index !== undefined)
            .map((problem) => problem.index as number),
        );
      const keptOf = (
        draft: { lines: PlanLineDraft[] },
        bad: Set<number>,
      ): PlanLineDraft[] => draft.lines.filter((_, index) => !bad.has(index));
      // The first draft deduplicated against itself: the planner lists
      // a member twice in one breath more often than it should.
      let kept = mergePlanLines([], keptOf(planned.value, badOf(problems)));
      let heading = planned.value.heading;
      let refused = planned.value.lines.length - kept.length;
      if (problems.length) {
        // Asked once more with the rules it broke; the retry can only add.
        const correction = problems
          .map((problem) => problem.detail)
          .slice(0, 8)
          .join('; ');
        const secondRaw = await this.llm.lectureBoardPlan({
          ...request,
          correction,
        });
        await this.recordBoardCall(input.documentId, secondRaw.usage);
        const second = {
          ...secondRaw,
          value: {
            ...secondRaw.value,
            lines: secondRaw.value.lines.map(asWritten),
          },
        };
        const secondProblems = planProblems(second.value, ctx);
        const secondKept = keptOf(second.value, badOf(secondProblems));
        const before = kept.length;
        kept = mergePlanLines(kept, secondKept);
        refused =
          planned.value.lines.length + second.value.lines.length - kept.length;
        if (
          problems.some((problem) => problem.index === undefined) &&
          !secondProblems.some((problem) => problem.index === undefined)
        ) {
          heading = second.value.heading;
        }
        this.logger.log(
          `${input.documentId} p${beat.pageNumber} ${input.style}: board plan kept ${before} of ${planned.value.lines.length}, the retry added ${kept.length - before} (${[
            ...problems,
            ...secondProblems,
          ]
            .filter((problem) => problem.index !== undefined)
            .map((problem) => problem.kind)
            .join(', ')})`,
        );
      }
      // In the order the moves are taught, whatever order the planner
      // returned; then a run of flat points in one move is a list, given
      // its name and its shape whatever the planner did.
      const inMoveOrder = kept
        .map((line, index) => ({ line, index }))
        .sort((a, b) => a.line.move - b.line.move || a.index - b.index)
        .map((entry) => entry.line);
      const shaped = listsFromRuns(inMoveOrder, input.moves);
      const lines = shaped.map((line, index) => ({
        number: index + 1,
        move: line.move,
        kind: line.kind,
        text: line.text,
        meaning: line.meaning,
        level: line.level,
        important: line.important,
      }));
      if (refused && !problems.length) {
        this.logger.warn(
          `${input.documentId} p${beat.pageNumber} ${input.style}: board plan left off ${refused} lines`,
        );
      }
      if (!lines.length) return null;
      return { heading: heading.trim() || null, lines };
    } catch (error) {
      this.logger.warn(
        `${input.documentId} p${beat.pageNumber} ${input.style}: board plan failed (${(error as Error).message}); the board is written from the words instead`,
      );
      return null;
    }
  }

  private async recordBoardCall(
    documentId: string,
    usage: {
      model: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    },
  ): Promise<void> {
    await this.calls.record({
      documentId,
      task: 'lecture_board',
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs: usage.latencyMs,
      outcome: 'ok',
    });
  }

  private async verifySegment(
    documentId: string,
    script: string,
    context: {
      plan: string;
      prevTail: string;
      neighbours: NeighbourPage[];
      pageText: string;
    },
  ): Promise<VerifyResult> {
    const verdict = await this.llm.lectureVerify({
      script,
      pageText: context.pageText,
      context: {
        plan: context.plan,
        prevTail: context.prevTail,
        neighbours: context.neighbours,
      },
    });
    await this.recordVerify(documentId, verdict.usage);
    return verdict.value;
  }

  private async recordVerify(
    documentId: string,
    usage: {
      model: string;
      tokensIn: number | null;
      tokensOut: number | null;
      latencyMs: number | null;
    },
  ): Promise<void> {
    await this.calls.record({
      documentId,
      task: 'lecture_verify',
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs: usage.latencyMs,
      outcome: 'ok',
    });
  }

  /** The text of the given chapter pages, trimmed for the verifier. */
  private async neighbourPages(
    documentId: string,
    candidates: (LectureSegmentRecord | undefined)[],
  ): Promise<NeighbourPage[]> {
    const pages: NeighbourPage[] = [];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const page = await this.pages.findOne(documentId, candidate.pageNumber);
      const text = (page?.text ?? '').slice(0, NEIGHBOUR_CHARS);
      if (text.trim()) pages.push({ pageNumber: candidate.pageNumber, text });
    }
    return pages;
  }

  /** Fails every page of the chapter that has no words yet, and says so. */
  private async failUnwritten(
    documentId: string,
    rows: LectureSegmentRecord[],
    contentVersion: number,
    style: LectureStyle,
    reason: string,
  ): Promise<void> {
    for (const row of rows) {
      if (row.scriptText) continue;
      await this.lectures.markSegmentFailed({
        documentId,
        pageNumber: row.pageNumber,
        contentVersion,
        style,
        kind: row.kind,
        error: reason,
      });
      await this.events.publish(documentId, {
        type: 'lecture.segment_failed',
        pageNumber: row.pageNumber,
        style,
        kind: row.kind,
      });
    }
  }
}

/**
 * The plan as the verifier sees it: what the writer legitimately knew
 * beyond the page in front of it, including what it was told is new here
 * and what it was told to skip.
 */
function describePlan(plan: LecturePlan, beat: LectureBeat): string {
  return [
    `Hook: ${plan.hook}`,
    `Arc: ${plan.arc}`,
    plan.payoff ? `Payoff: ${plan.payoff}` : null,
    plan.problem ? `Problem the chapter answers: ${plan.problem}` : null,
    plan.terms?.length
      ? `Terms: ${plan.terms.map((entry) => `${entry.term} (${entry.meaning})`).join('; ')}`
      : null,
    `This page's goal: ${beat.goal}`,
    beat.newHere ? `New here: ${beat.newHere}` : null,
    beat.skip ? `Skip (taught earlier): ${beat.skip}` : null,
    beat.weight ? `Weight: ${beat.weight}` : null,
    beat.moves?.length ? `Moves: ${beat.moves.join('; ')}` : null,
    beat.callback ? `Callback: ${beat.callback}` : null,
    beat.foreshadow ? `Foreshadow: ${beat.foreshadow}` : null,
    beat.pitfall ? `Pitfall: ${beat.pitfall}` : null,
    beat.turn ? 'Turn: the listener is asked to predict here' : null,
  ]
    .filter(Boolean)
    .join('\n');
}
