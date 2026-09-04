import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LectureStyle, SegmentKind } from '../../contracts';
import { EVENT_BUS, JOB_QUEUE, LLM_GATEWAY } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { JobQueuePort } from '../../business/ports/job-queue.port';
import type {
  LectureBoardDraft,
  LlmGatewayPort,
} from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  LECTURE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  LectureRepository,
  LectureSegmentRecord,
} from '../../business/repositories/lecture.repository';
import {
  BOARD_GENERATOR_VERSION,
  boardIsCurrent,
  boardProblems,
  repairCutWords,
  buildBoardOps,
  checkDraft,
  emptyTimeline,
  estimateWordTimes,
  termsDraft,
  timeBoard,
  wordsOf,
  type BeatFigure,
  type BoardContext,
  type BoardDraft,
  type BoardTimeline,
  type DiagramGeometry,
  type WordTimes,
  maxWrittenFor,
  moveSpansOf,
  mergeDrafts,
  lostItems,
  mergeRepairs,
  boardMarks,
  markedDraft,
} from '../../business/domain/board';
import { diagramAnchor, elementOrder } from '../../business/domain/diagram';
import {
  LECTURE_STYLES,
  beatFor,
  scriptForTts,
  type LectureBeat,
  type LecturePlan,
  type LectureSection,
  type PageBoard,
} from '../../business/domain/lecture';

/** The row a board belongs to, as every board call names it. */
export interface BoardRowKey {
  documentId: string;
  contentVersion: number;
  pageNumber: number;
  style: LectureStyle;
  kind: SegmentKind;
}

/**
 * The board's life around a lecture row: written from the accepted
 * script, given a diagram when the plan asked for one, timed once the
 * audio is measured, and served when done.
 *
 * Nothing here may fail the page. Every method catches its own errors,
 * marks the board failed and returns, because a lecture that plays
 * without its board is a lecture, and one that waits on its board is not.
 */
@Injectable()
export class LectureBoardService {
  private readonly logger = new Logger(LectureBoardService.name);

  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly config: ConfigService,
  ) {}

  /** Boards are on unless the deployment turned them off. */
  enabled(): boolean {
    return this.config.get<string>('LECTURE_BOARD_ENABLED', 'true') !== 'false';
  }

  /**
   * Writes the board for a page whose script was just accepted. The draft
   * comes from the model; the rules that make it a board are applied in
   * code, once with a correction and then by filtering. Stored as pending
   * with its anchors; the timer gives it its times once the audio exists.
   */
  /**
   * The board planned before the speech and placed by it: the plan's
   * lines, each where the speech marked it. No model call; the rules
   * still run so a bad line is left off, and the timer lets the voice
   * wait for the pen.
   */
  async writeFromMarkers(input: {
    key: BoardRowKey;
    script: string;
    pageText: string;
    plan: LecturePlan;
    beat: LectureBeat;
    durationMs: number;
    continues: boolean;
    startLine?: number;
    sections: LectureSection[];
    board: PageBoard;
  }): Promise<BoardTimeline | null> {
    if (!this.enabled()) return null;
    const { key } = input;
    const spoken = scriptForTts(input.script);
    try {
      const marks = boardMarks(input.script, spoken, input.sections, {
        heading: input.continues ? null : input.board.heading,
        lines: input.board.lines,
      });
      if (!marks || !marks.lines.length) {
        await this.lectures.saveBoard({
          ...key,
          board: { ...emptyTimeline(spoken.length), marked: true },
          boardStatus: 'skipped',
        });
        return null;
      }
      const ctx: BoardContext = {
        spoken,
        pageText: input.pageText,
        planLines: [
          input.beat.goal,
          input.beat.newHere ?? '',
          ...(input.plan.terms ?? []).map(
            (entry) => `${entry.term} ${entry.meaning}`,
          ),
        ],
        style: key.style,
        durationMs: input.durationMs,
        continues: input.continues,
        light: input.beat.weight === 'light',
        startLine: input.startLine,
        moves: [...(input.beat.moves ?? []), input.beat.goal],
        goal: input.beat.goal,
      };
      const draft = markedDraft(marks);
      const refused = boardProblems(draft, ctx).filter(
        (problem) => problem.index !== undefined,
      );
      const unplaced = marks.lines.filter(
        (line) => line.placed === 'move',
      ).length;
      if (refused.length || unplaced) {
        this.logger.warn(
          `${rowKey(key)} board: ${marks.lines.length} lines planned, ${unplaced} not said and placed at their move, ${refused.length} refused${refused.length ? `: ${refused.map((problem) => `${problem.kind} ${problem.detail}`).join('; ')}` : ''}`,
        );
      }
      const built = buildBoardOps(
        repairCutWords(draft, ctx),
        ctx,
        rowKey(key),
        boardPrefix(key),
      );
      const timeline: BoardTimeline = {
        ...emptyTimeline(spoken.length),
        boards: built.boards,
        ops: built.ops,
        marked: true,
        holds: [],
      };
      await this.timeFresh(key, timeline);
      return timeline;
    } catch (error) {
      await this.fail(key, (error as Error).message);
      return null;
    }
  }

  async writeForPage(input: {
    key: BoardRowKey;
    script: string;
    pageText: string;
    topicTitle: string;
    plan: LecturePlan;
    beat: LectureBeat;
    durationMs: number;
    /** True when this row draws on a board an earlier row opened (a part, or a page mid-board). */
    continues: boolean;
    bridge: boolean;
    /** For a continuing row: the first free line of the board it joins. */
    startLine?: number;
    /** Where each move begins in the script, for coverage of the moves. */
    moveOffsets?: number[];
  }): Promise<BoardTimeline | null> {
    if (!this.enabled()) return null;
    const { key } = input;
    const spoken = scriptForTts(input.script);
    if (input.bridge || wordsOf(spoken).length < 12) {
      await this.lectures.saveBoard({
        ...key,
        board: emptyTimeline(spoken.length),
        boardStatus: 'skipped',
      });
      return null;
    }
    try {
      const ctx: BoardContext = {
        spoken,
        pageText: input.pageText,
        planLines: [
          input.beat.goal,
          input.beat.newHere ?? '',
          ...(input.plan.terms ?? []).map(
            (entry) => `${entry.term} ${entry.meaning}`,
          ),
        ],
        style: key.style,
        durationMs: input.durationMs,
        continues: input.continues,
        light: input.beat.weight === 'light',
        startLine: input.startLine,
        moves: [...(input.beat.moves ?? []), input.beat.goal],
        goal: input.beat.goal,
        moveSpans: input.moveOffsets?.length
          ? moveSpansOf(
              input.beat.moves ?? [],
              input.moveOffsets,
              spoken.length,
            )
          : undefined,
      };
      const request = {
        topicTitle: input.topicTitle,
        spoken,
        pageText: input.pageText,
        moves: input.beat.moves ?? [input.beat.goal],
        goal: input.beat.goal,
        newHere: input.beat.newHere ?? null,
        pitfall: input.beat.pitfall ?? null,
        terms: input.plan.terms ?? [],
        style: key.style,
        continues: input.continues,
        budget: {
          min: Math.max(1, (input.beat.moves ?? []).length),
          max: maxWrittenFor(key.style, input.durationMs),
        },
      };
      const first = await this.draft(key.documentId, request);
      const problems = boardProblems(first, ctx);
      let draft: BoardDraft = first;
      if (problems.length) {
        const correction = problems
          .map((problem) => problem.detail)
          .slice(0, 8)
          .join('; ');
        const second = await this.draft(key.documentId, {
          ...request,
          correction,
        });
        // Neither draft is taken whole: every good item of the first
        // stays, the second stands in where the first failed and adds what
        // it left bare. The retry can only add.
        draft = mergeDrafts(first, second, ctx);
        // What both drafts lost goes back once more, to be rewritten as
        // the lecturer's claim rather than left off the board.
        const lost = lostItems([first, second], draft, ctx);
        if (lost.length) {
          const repaired = await this.draft(key.documentId, {
            ...request,
            repair: lost,
          });
          draft = mergeRepairs(draft, repaired, ctx);
        }
      }
      const built = buildBoardOps(
        repairCutWords(draft, ctx),
        ctx,
        rowKey(key),
        boardPrefix(key),
      );
      const timeline: BoardTimeline = {
        ...emptyTimeline(spoken.length),
        boards: built.boards,
        ops: built.ops,
      };
      await this.timeFresh(key, timeline);
      return timeline;
    } catch (error) {
      await this.fail(key, (error as Error).message);
      return null;
    }
  }

  /**
   * The segments around a chapter write deterministic boards: the words a
   * slow learner hears first, the questions of the check. No model call.
   */
  async writeForExtra(input: {
    key: BoardRowKey;
    script: string;
    topicTitle: string;
    plan: LecturePlan;
    durationMs: number;
  }): Promise<BoardTimeline | null> {
    if (!this.enabled()) return null;
    const { key } = input;
    const spoken = scriptForTts(input.script);
    try {
      let draft: BoardDraft | null = null;
      if (key.kind === 'terms') {
        draft = termsDraft(input.topicTitle, input.plan.terms ?? []);
      } else if (key.kind === 'check') {
        draft = checkDraft(spoken);
      }
      if (!draft || !draft.items.length) {
        await this.lectures.saveBoard({
          ...key,
          board: emptyTimeline(spoken.length),
          boardStatus: 'skipped',
        });
        return null;
      }
      const ctx: BoardContext = {
        spoken,
        pageText: spoken,
        planLines: (input.plan.terms ?? []).map(
          (entry) => `${entry.term} ${entry.meaning}`,
        ),
        style: key.style,
        durationMs: input.durationMs,
        continues: false,
        light: true,
      };
      const built = buildBoardOps(
        repairCutWords(draft, ctx),
        ctx,
        rowKey(key),
        boardPrefix(key),
      );
      const timeline: BoardTimeline = {
        ...emptyTimeline(spoken.length),
        boards: built.boards,
        ops: built.ops,
      };
      await this.timeFresh(key, timeline);
      return timeline;
    } catch (error) {
      await this.fail(key, (error as Error).message);
      return null;
    }
  }

  /**
   * Adds a laid-out diagram to a row's board. A board already timed is
   * timed again so the drawing gets its moments; one not yet timed keeps
   * the geometry for when it is.
   */
  async attachDiagram(input: {
    key: BoardRowKey;
    geometry: DiagramGeometry;
  }): Promise<void> {
    const row = await this.lectures.findSegment(
      input.key.documentId,
      input.key.pageNumber,
      input.key.contentVersion,
      input.key.style,
      input.key.kind,
    );
    const timeline = row?.board as BoardTimeline | null;
    if (!row || !timeline || !boardIsCurrent(timeline)) return;
    if (timeline.diagrams.some((entry) => entry.id === input.geometry.id))
      return;
    const boardId =
      timeline.boards[timeline.boards.length - 1]?.id ?? boardPrefix(input.key);
    const next: BoardTimeline = {
      ...timeline,
      diagrams: [...timeline.diagrams, input.geometry],
      ops: [
        ...timeline.ops,
        {
          id: `${rowKey(input.key)}-diagram-${timeline.diagrams.length + 1}`,
          kind: 'diagram',
          boardId,
          anchor: diagramAnchor(input.geometry),
          t0Ms: null,
          durMs: null,
          seed: 7,
          slot: 100,
          priority: 3,
          diagramId: input.geometry.id,
          elementOrder: elementOrder(input.geometry),
        },
      ],
    };
    if (row.boardStatus === 'done') {
      const wordTimes = row.wordTimes as WordTimes | null;
      await this.time(input.key, row, next, wordTimes);
      return;
    }
    await this.lectures.saveBoard({
      ...input.key,
      board: next,
      boardStatus: row.boardStatus === 'failed' ? 'failed' : 'pending',
    });
  }

  /**
   * Gives a row's board its times from the word times, or from the
   * estimate when there are none, and announces it. Called by the aligner
   * when it has measured the audio, and by the backfill and the diagram
   * step when they change a board already voiced.
   */
  async timeRow(input: {
    key: BoardRowKey;
    row: LectureSegmentRecord;
    wordTimes: WordTimes | null;
  }): Promise<void> {
    const timeline = input.row.board as BoardTimeline | null;
    if (!timeline || !boardIsCurrent(timeline)) return;
    if (
      input.row.boardStatus === 'skipped' ||
      input.row.boardStatus === 'failed'
    ) {
      return;
    }
    await this.time(input.key, input.row, timeline, input.wordTimes);
  }

  /**
   * A freshly written board is timed at once, so it is ready with the
   * words: on times measured for this audio when the row has them, else
   * on the estimate. Alignment, when it comes, times it again.
   */
  private async timeFresh(
    key: BoardRowKey,
    timeline: BoardTimeline,
  ): Promise<void> {
    const row = await this.lectures.findSegment(
      key.documentId,
      key.pageNumber,
      key.contentVersion,
      key.style,
      key.kind,
    );
    if (!row) return;
    const times = row.wordTimes as WordTimes | null;
    const measured =
      times && times.audioKey === row.audioKey && times.source !== 'estimate'
        ? times
        : null;
    await this.time(key, row, timeline, measured);
  }

  private async time(
    key: BoardRowKey,
    row: LectureSegmentRecord,
    timeline: BoardTimeline,
    wordTimes: WordTimes | null,
  ): Promise<void> {
    try {
      const spoken = scriptForTts(row.scriptText ?? '');
      const durationMs =
        row.durationMs ?? Math.round((spoken.length / 15) * 1000);
      const times =
        wordTimes && wordTimes.audioKey === (row.audioKey ?? wordTimes.audioKey)
          ? wordTimes
          : estimateWordTimes(spoken, durationMs, row.audioKey ?? '');
      const timed = timeBoard(timeline, times, durationMs, key.style, spoken);
      await this.lectures.saveBoard({
        ...key,
        board: timed,
        boardStatus: 'done',
      });
      await this.events.publish(key.documentId, {
        type: 'lecture.board_ready',
        pageNumber: key.pageNumber,
        style: key.style,
        kind: key.kind,
      });
    } catch (error) {
      await this.fail(key, (error as Error).message);
    }
  }

  /** What the planner asked to be drawn on this page, if anything. */
  figureFor(plan: LecturePlan, pageNumber: number): BeatFigure | null {
    const beat = beatFor(plan, pageNumber);
    const figure = beat.figure;
    if (!figure || figure.kind === 'none' || !figure.shows) return null;
    return figure;
  }

  /** Asks for the page's drawing, once the board exists to hold it. */
  async requestDiagram(key: BoardRowKey & { topicId: string }): Promise<void> {
    await this.queue.enqueueLectureDiagrams([
      {
        documentId: key.documentId,
        contentVersion: key.contentVersion,
        topicId: key.topicId,
        pageNumber: key.pageNumber,
        style: key.style,
      },
    ]);
  }

  /** Asks for the row's audio to be measured, once it exists. */
  async requestAlignment(key: BoardRowKey): Promise<void> {
    await this.queue.enqueueLectureAligns([
      {
        documentId: key.documentId,
        contentVersion: key.contentVersion,
        pageNumber: key.pageNumber,
        style: key.style,
        kind: key.kind,
      },
    ]);
  }

  private async draft(
    documentId: string,
    request: Parameters<LlmGatewayPort['lectureBoard']>[0],
  ): Promise<LectureBoardDraft> {
    const result = await this.llm.lectureBoard(request);
    await this.calls.record({
      documentId,
      task: 'lecture_board',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });
    return result.value;
  }

  private async fail(key: BoardRowKey, reason: string): Promise<void> {
    this.logger.warn(
      `${key.documentId} p${key.pageNumber} ${key.style} ${key.kind}: board failed (${reason})`,
    );
    try {
      await this.lectures.saveBoard({
        ...key,
        board: null,
        boardStatus: 'failed',
      });
      await this.events.publish(key.documentId, {
        type: 'lecture.board_failed',
        pageNumber: key.pageNumber,
        style: key.style,
        kind: key.kind,
      });
    } catch {
      // The page is written and voiced regardless; the board simply is not.
    }
  }
}

/** The stable id prefix for a row's operations. */
export function rowKey(key: BoardRowKey): string {
  return `b${key.pageNumber}${key.kind === 'page' ? '' : `-${key.kind}`}-${key.style[0]}`;
}

function boardPrefix(key: BoardRowKey): string {
  return `${rowKey(key)}-board`;
}

/** The style's delivery line, for the diagram prompt's register. */
export function styleDirection(style: LectureStyle): string {
  return LECTURE_STYLES[style].direction;
}

export { BOARD_GENERATOR_VERSION };
