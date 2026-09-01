import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, JOB_QUEUE, LLM_GATEWAY } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { JobQueuePort } from '../../business/ports/job-queue.port';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
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
import {
  LECTURE_GENERATOR_VERSION,
  MAX_SEGMENT_ATTEMPTS,
  acceptSegment,
  beatFor,
  estimateDurationMs,
  hookProblems,
  hookShapeFor,
  joinOpening,
  listShape,
  openingsBefore,
  outlineCorrection,
  scriptForTts,
  styleProblems,
  tailOf,
  taughtLines,
  unsupportedFigures,
  validateOutline,
  type BeatWeight,
  type LectureBeat,
  type LecturePlan,
  type VerifyResult,
} from '../../business/domain/lecture';
import type { LectureChapterJobData } from '../queues';
import type { JobContext } from './base.processor';

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

/**
 * One chapter's lecture: planned, then written page by page IN ORDER.
 *
 * The order is the whole point. Each page is written knowing the tail of
 * the page before it, which is what makes a lecture rather than a stack
 * of summaries — so pages inside a chapter can never run concurrently.
 * Chapters run alongside each other instead, which is where the
 * parallelism lives. Synthesis is handed to its own queue so a chapter
 * keeps writing while its earlier pages are being voiced.
 *
 * Two things the prompts could not make the writer do are done here in
 * code: the chapter's opening is the planner's hook spoken word for word
 * (the writer only continues from it), and a page that opens with a tic,
 * runs long, or ends on a recap is sent back with the reason.
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
  ) {}

  async process(
    job: LectureChapterJobData,
    context: JobContext,
  ): Promise<void> {
    const { documentId, topicId, contentVersion, orderIndex } = job;

    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;

    const topics = await this.topics.listByDocument(documentId);
    const topic = topics.find((candidate) => candidate.id === topicId);
    if (!topic) return;

    // The rows were seeded when the lecture was asked for, so the shape of
    // the whole lecture is visible before any model call is made.
    const all = await this.lectures.listSegments(documentId, contentVersion);
    const rows = all.filter((row) => row.topicId === topicId);
    if (!rows.length) return;

    // How the chapters before this one began, so this one begins
    // differently. Chapters are written alongside each other, so early in
    // a lecture this is often empty and the rotating shape carries the
    // variety alone.
    const priorOpenings = openingsBefore(all, rows[0].seq);
    const lectured = new Set(
      all
        .filter((row) => row.scriptText && row.topicId)
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
        rows,
        contentVersion,
        'The chapter could not be planned',
      );
      return;
    }

    for (const row of rows) {
      // Resume-safe: a chapter retried by the queue picks up where it
      // stopped. The script's existence is the idempotency key, not the
      // status, because a written page legitimately sits in `voicing`.
      if (row.scriptText) continue;
      await this.writeOne({
        doc,
        topicTitle: topic.title,
        plan,
        row,
        rows,
        contentVersion,
        taughtEarlier,
      });
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
    if (existing?.status === 'done' && existing.plan) {
      return existing.plan as LecturePlan;
    }

    const pageNumbers = rows.map((row) => row.pageNumber);
    const pageRows = await this.pages.findRange(
      doc.id,
      pageNumbers[0],
      pageNumbers[pageNumbers.length - 1],
    );
    const pages: PageText[] = pageRows
      .filter((page) => pageNumbers.includes(page.pageNumber))
      .map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text.slice(0, 4_000),
      }));

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
      const plan: LecturePlan = { ...result.value, hookSpoken };

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
    topicTitle: string;
    plan: LecturePlan;
    row: LectureSegmentRecord;
    rows: LectureSegmentRecord[];
    contentVersion: number;
    taughtEarlier: string[];
  }): Promise<void> {
    const { doc, plan, row, rows, contentVersion } = input;
    await this.lectures.markSegmentWriting(
      doc.id,
      row.pageNumber,
      contentVersion,
    );

    try {
      const page = await this.pages.findOne(doc.id, row.pageNumber);
      const pageText = (page?.text ?? '').slice(0, 6_000);

      // The nearest EARLIER page that actually has words: pages the
      // lecture skipped, and pages that failed, leave gaps.
      const previous = rows
        .filter((other) => other.seq < row.seq && other.scriptText)
        .pop();

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

      const script = await this.writeChecked({
        documentId: doc.id,
        topicTitle: input.topicTitle,
        plan,
        pageNumber: row.pageNumber,
        pageText,
        prevTail: previous?.scriptText ? tailOf(previous.scriptText) : '',
        isFirstOfTopic,
        isLastOfTopic: index === rows.length - 1,
        bridge: row.bridge,
        opening,
        taughtSoFar,
        comingLater,
        list: listShape(pageText),
        neighbours,
      });

      // Kept in memory too, so the next page in this loop sees it without
      // a round trip to the database.
      row.scriptText = script;

      await this.lectures.markSegmentWritten({
        documentId: doc.id,
        pageNumber: row.pageNumber,
        contentVersion,
        scriptText: script,
        durationMs: estimateDurationMs(scriptForTts(script)),
      });

      await this.queue.enqueueLectureVoices([
        { documentId: doc.id, contentVersion, pageNumber: row.pageNumber },
      ]);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(
        `${doc.id} p${row.pageNumber} lecture script failed — ${message}`,
      );
      await this.lectures.markSegmentFailed({
        documentId: doc.id,
        pageNumber: row.pageNumber,
        contentVersion,
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
      });
    }
  }

  /**
   * Writes the segment and sends it back while it needs to be: for how it
   * reads (a banned opener, a throat-clearing start, too many words, a
   * recap ending) and for what it claims, while attempts remain. The last
   * attempt is written strictly from the page when the material was left
   * before, and is then kept unless it carries a figure the material does
   * not contain: the verifier's word alone no longer makes a hole.
   */
  private async writeChecked(input: {
    documentId: string;
    topicTitle: string;
    plan: LecturePlan;
    pageNumber: number;
    pageText: string;
    prevTail: string;
    isFirstOfTopic: boolean;
    isLastOfTopic: boolean;
    bridge: boolean;
    opening: string | null;
    taughtSoFar: string[];
    comingLater: string[];
    list: { items: number } | null;
    neighbours: NeighbourPage[];
  }): Promise<string> {
    const beat = beatFor(input.plan, input.pageNumber);
    const weight: BeatWeight = beat.weight ?? 'full';
    const planText = describePlan(input.plan, beat);
    // Everything a figure in the script may legitimately come from.
    const sources = [
      input.pageText,
      ...input.neighbours.map((page) => page.text),
      planText,
      input.prevTail,
    ];
    let correction: string | undefined;
    let styleCorrection: string | undefined;
    let leftTheMaterial = false;

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
        },
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

      // A page that reads badly goes straight back while there are
      // attempts left: no verifier call is spent on words we will not keep.
      const style = styleProblems(written.value, {
        weight,
        bridge: input.bridge,
      });
      if (style.length && attempt < MAX_SEGMENT_ATTEMPTS) {
        styleCorrection = style.map((problem) => problem.detail).join('; ');
        correction = undefined;
        continue;
      }

      // A one-line bridge has almost nothing to be unfaithful to, and the
      // check would cost a model call per figure page.
      const verdict = input.bridge
        ? { grounded: true, problems: [] }
        : await this.verifySegment(input.documentId, written.value, {
            plan: planText,
            prevTail: input.prevTail,
            neighbours: input.neighbours,
            pageText: input.pageText,
          });
      const figures = input.bridge
        ? []
        : unsupportedFigures(written.value, sources);

      const decision = acceptSegment(
        written.value,
        verdict,
        attempt,
        style,
        figures,
      );
      if (decision.action === 'accept') {
        if (decision.warning) {
          this.logger.warn(
            `${input.documentId} p${input.pageNumber}: kept despite style (${decision.warning})`,
          );
        }
        return input.opening
          ? joinOpening(input.opening, written.value)
          : written.value;
      }
      if (decision.action === 'fail') {
        throw new Error(`Script left the page: ${decision.reason}`);
      }
      correction = decision.reason;
      styleCorrection = undefined;
      leftTheMaterial = true;
    }
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
    reason: string,
  ): Promise<void> {
    for (const row of rows) {
      if (row.scriptText) continue;
      await this.lectures.markSegmentFailed({
        documentId,
        pageNumber: row.pageNumber,
        contentVersion,
        error: reason,
      });
      await this.events.publish(documentId, {
        type: 'lecture.segment_failed',
        pageNumber: row.pageNumber,
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
    `This page's goal: ${beat.goal}`,
    beat.newHere ? `New here: ${beat.newHere}` : null,
    beat.skip ? `Skip (taught earlier): ${beat.skip}` : null,
    beat.weight ? `Weight: ${beat.weight}` : null,
    beat.callback ? `Callback: ${beat.callback}` : null,
    beat.foreshadow ? `Foreshadow: ${beat.foreshadow}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
