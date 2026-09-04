import { ConfigService } from '@nestjs/config';
import type { LectureStyle, SegmentKind } from '../../contracts';
import { FakeLlmAdapter } from '../../web/adapters/fake-llm.adapter';
import {
  LECTURE_GENERATOR_VERSION,
  extraSeeds,
  playOrder,
  scriptForTts,
} from '../../business/domain/lecture';
import type {
  LectureRepository,
  LectureSegmentRecord,
} from '../../business/repositories/lecture.repository';
import { LectureChapterProcessor } from './lecture-chapter.processor';
import { LectureVoiceProcessor } from './lecture-voice.processor';
import { LectureBoardService } from './lecture-board.service';
import { LectureAlignProcessor } from './lecture-align.processor';
import { LectureDiagramProcessor } from './lecture-diagram.processor';
import { LectureBoardProcessor } from './lecture-board.processor';
import { FakeAlignerAdapter } from '../../web/adapters/fake-aligner.adapter';
import type { BoardTimeline, WordTimes } from '../../business/domain/board';

/**
 * What matters about this pipeline: a chapter is written IN ORDER, so
 * every page after the first knows what was just said (that thread is
 * the whole difference between a lecture and a stack of summaries), a
 * page that cannot be written fails alone, synthesis happens off the
 * writing path without ever clobbering a script, and the three styles of
 * a lecture are written from one shared plan so a learner can switch
 * between them mid-idea.
 */

const CONTEXT = { attemptsMade: 1, isFinalAttempt: false };
const FINAL = { attemptsMade: 3, isFinalAttempt: true };

const doc = {
  id: 'doc-1',
  contentVersion: 2,
  props: { title: 'Macroeconomics', deletedAt: null, pageCount: 4 },
};

const TOPIC = {
  id: 'topic-1',
  title: 'Inflation',
  shortDescription: null,
  startPage: 1,
  endPage: 4,
  orderIndex: 0,
};

const REAL_PAGE =
  'Sustained monetary expansion engenders inflationary pressure insofar ' +
  'as aggregate demand outpaces the productive capacity of the economy, ' +
  'a dynamic amplified through the expectations channel.';

const USAGE = { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 };

/**
 * A writer whose test double returns its own sections has no marks in
 * them; with no board planned, none are expected of it.
 */
const withoutBoard = (llm: FakeLlmAdapter): FakeLlmAdapter => {
  llm.lectureBoardPlan = () =>
    Promise.resolve({ value: { heading: 'Notes', lines: [] }, usage: USAGE });
  return llm;
};

/** A writer's answer: one section, as most tests need. */
const draft = (text: string) => ({
  value: { sections: [{ move: 0, text }] },
  usage: USAGE,
});

const key = (
  style: LectureStyle,
  pageNumber: number,
  kind: SegmentKind = 'page',
) => `${style}:${pageNumber}:${kind}`;

function fakes(
  pageText: Record<number, string>,
  topics = [TOPIC],
  styles: LectureStyle[] = ['steady'],
) {
  /** Every row, every style, keyed by style and page. */
  const rows = new Map<string, LectureSegmentRecord>();
  const plans = new Map<
    string,
    { status: string; plan: unknown; generatorVersion?: string }
  >();
  const voiceJobs: {
    pageNumber: number;
    style: LectureStyle;
    kind?: SegmentKind;
  }[] = [];
  const stored: string[] = [];
  const published: { type: string; pageNumber: number; style?: string }[] = [];
  let synthesised = 0;
  const alignJobs: {
    pageNumber: number;
    style: LectureStyle;
    kind: SegmentKind;
  }[] = [];
  const diagramJobs: { pageNumber: number; style: LectureStyle }[] = [];
  const boardJobs: {
    pageNumber: number;
    style: LectureStyle;
    kind: SegmentKind;
  }[] = [];
  /** What the voice was asked to say, and how. */
  const voiced: { text: string; instructions?: string; speed?: number }[] = [];

  // Seeded the way the generate handler seeds them: every page pending
  // before any model call, with dense document-global order, per style.
  Object.keys(pageText)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((pageNumber, index) => {
      const owner = topics.find(
        (t) => pageNumber >= t.startPage && pageNumber <= t.endPage,
      );
      for (const style of styles) {
        rows.set(key(style, pageNumber), {
          topicId: owner?.id ?? topics[0].id,
          pageNumber,
          seq: index,
          style,
          kind: 'page',
          status: 'pending',
          scriptText: null,
          audioKey: null,
          durationMs: null,
          bridge: (pageText[pageNumber] ?? '').length < 120,
          attempts: 0,
          moveOffsets: null,
          board: null,
          wordTimes: null,
          boardStatus: 'none',
        });
      }
    });

  const row = (
    pageNumber: number,
    style: LectureStyle = 'steady',
    kind: SegmentKind = 'page',
  ) => rows.get(key(style, pageNumber, kind));
  /** Seeds the extras a style gets, the way the generate handler does. */
  const seedExtras = (style: LectureStyle) => {
    const pages = [...rows.values()]
      .filter((r) => r.style === style && r.kind === 'page')
      .map((r) => ({
        topicId: r.topicId ?? topics[0].id,
        pageNumber: r.pageNumber,
        seq: r.seq,
        bridge: r.bridge,
      }));
    for (const extra of extraSeeds(pages, style)) {
      rows.set(key(style, extra.pageNumber, extra.kind), {
        ...extra,
        style,
        status: 'pending',
        scriptText: null,
        audioKey: null,
        durationMs: null,
        attempts: 0,
        moveOffsets: null,
        board: null,
        wordTimes: null,
        boardStatus: 'none',
      });
    }
  };
  const ordered = (style?: LectureStyle) =>
    playOrder(
      [...rows.values()]
        .filter((r) => !style || r.style === style)
        .sort((a, b) => a.seq - b.seq || a.style.localeCompare(b.style)),
    );

  const lectures: LectureRepository = {
    savePlan: (input) => {
      plans.set(input.topicId, {
        status: input.status,
        plan: input.plan,
        generatorVersion: input.generatorVersion,
      });
      return Promise.resolve();
    },
    findPlan: (_d, topicId) =>
      Promise.resolve(
        plans.has(topicId)
          ? {
              topicId,
              status: plans.get(topicId)!.status as never,
              plan: plans.get(topicId)!.plan,
              generatorVersion: plans.get(topicId)!.generatorVersion,
            }
          : null,
      ),
    listPlans: () =>
      Promise.resolve(
        [...plans.entries()].map(([topicId, entry]) => ({
          topicId,
          status: entry.status as never,
          plan: entry.plan,
        })),
      ),
    // Like the real one: rows that exist are left alone.
    seedSegments: (input) => {
      for (const seed of input.segments) {
        const kind = seed.kind ?? 'page';
        if (rows.has(key(seed.style, seed.pageNumber, kind))) continue;
        rows.set(key(seed.style, seed.pageNumber, kind), {
          topicId: seed.topicId,
          pageNumber: seed.pageNumber,
          seq: seed.seq,
          style: seed.style,
          kind,
          status: 'pending',
          scriptText: null,
          audioKey: null,
          durationMs: null,
          bridge: seed.bridge,
          attempts: 0,
          moveOffsets: null,
          board: null,
          wordTimes: null,
          boardStatus: 'none',
        });
      }
      return Promise.resolve();
    },
    findSegment: (_d, pageNumber, _v, style, kind) =>
      Promise.resolve(row(pageNumber, style, kind) ?? null),
    listSegments: (_d, _v, style) => Promise.resolve(ordered(style)),
    removeSegments: (_d, _v, style, kind) => {
      for (const [k, r] of rows) {
        if (r.style === style && r.kind === kind) rows.delete(k);
      }
      return Promise.resolve();
    },
    markSegmentWriting: (_d, pageNumber, _v, style, kind) => {
      const r = row(pageNumber, style, kind);
      if (r) r.status = 'writing';
      return Promise.resolve();
    },
    markSegmentWritten: (input) => {
      const r = row(input.pageNumber, input.style, input.kind)!;
      r.status = 'voicing';
      r.scriptText = input.scriptText;
      r.moveOffsets = input.moveOffsets;
      r.durationMs = input.durationMs;
      return Promise.resolve();
    },
    markSegmentDone: (input) => {
      const r = row(input.pageNumber, input.style, input.kind)!;
      r.status = 'done';
      r.audioKey = input.audioKey;
      r.durationMs = input.durationMs;
      return Promise.resolve();
    },
    markSegmentFailed: (input) => {
      const r = row(input.pageNumber, input.style, input.kind)!;
      r.status = 'failed';
      r.attempts += 1;
      return Promise.resolve();
    },
    resetFailedSegments: () => Promise.resolve(),
    saveBoard: (input) => {
      const r = row(input.pageNumber, input.style, input.kind);
      if (r) {
        r.board = input.board;
        r.boardStatus = input.boardStatus;
      }
      return Promise.resolve();
    },
    saveWordTimes: (input) => {
      const r = row(input.pageNumber, input.style, input.kind);
      if (r) r.wordTimes = input.wordTimes;
      return Promise.resolve();
    },
    listForBoardBackfill: (_d, _v, topicIds) =>
      Promise.resolve(
        [...rows.values()].filter(
          (r) =>
            r.scriptText !== null &&
            (!topicIds || topicIds.includes(r.topicId ?? '')),
        ),
      ),
    clear: () => Promise.resolve(),
    savePosition: () => Promise.resolve(),
    findPosition: () => Promise.resolve(null),
  };

  const deps = {
    documents: { findById: () => Promise.resolve(doc) },
    pages: {
      findOne: (_d: string, pageNumber: number) =>
        Promise.resolve({
          pageNumber,
          text: pageText[pageNumber] ?? '',
          isEmpty: !pageText[pageNumber],
        }),
      findRange: () =>
        Promise.resolve(
          Object.entries(pageText).map(([pageNumber, text]) => ({
            pageNumber: Number(pageNumber),
            text,
            isEmpty: !text,
          })),
        ),
    },
    topics: { listByDocument: () => Promise.resolve(topics) },
    calls: { record: () => Promise.resolve() },
    queue: {
      enqueueLectureAligns: (
        jobs: { pageNumber: number; style: LectureStyle; kind?: SegmentKind }[],
      ) => {
        alignJobs.push(
          ...jobs.map((job) => ({
            pageNumber: job.pageNumber,
            style: job.style,
            kind: job.kind ?? 'page',
          })),
        );
        return Promise.resolve();
      },
      enqueueLectureDiagrams: (
        jobs: { pageNumber: number; style: LectureStyle }[],
      ) => {
        diagramJobs.push(
          ...jobs.map((job) => ({
            pageNumber: job.pageNumber,
            style: job.style,
          })),
        );
        return Promise.resolve();
      },
      enqueueLectureBoards: (
        jobs: { pageNumber: number; style: LectureStyle; kind?: SegmentKind }[],
      ) => {
        boardJobs.push(
          ...jobs.map((job) => ({
            pageNumber: job.pageNumber,
            style: job.style,
            kind: job.kind ?? 'page',
          })),
        );
        return Promise.resolve();
      },
      enqueueLectureVoices: (
        jobs: { pageNumber: number; style: LectureStyle; kind?: SegmentKind }[],
      ) => {
        voiceJobs.push(
          ...jobs.map((job) => ({
            pageNumber: job.pageNumber,
            style: job.style,
            ...(job.kind && job.kind !== 'page' ? { kind: job.kind } : {}),
          })),
        );
        return Promise.resolve();
      },
    },
    events: {
      publish: (
        _d: string,
        event: { type: string; pageNumber: number; style?: string },
      ) => {
        published.push(event);
        return Promise.resolve();
      },
    },
    speech: {
      synthesize: (input: {
        text: string;
        instructions?: string;
        speed?: number;
      }) => {
        synthesised += 1;
        voiced.push(input);
        return Promise.resolve({
          audio: Buffer.from('mp3'),
          mimeType: 'audio/mpeg',
          model: 'tts-1',
        });
      },
    },
    storage: {
      get: () => Promise.resolve(Buffer.from('mp3')),
      size: () => Promise.resolve(null),
      put: (input: { key: string }) => {
        stored.push(input.key);
        return Promise.resolve();
      },
    },
  };

  /** The steady rows by page, which is what most tests look at. */
  const segments = {
    get: (pageNumber: number) => row(pageNumber, 'steady'),
    values: () => ordered('steady'),
  };

  return {
    alignJobs,
    diagramJobs,
    boardJobs,
    voiced,
    seedExtras,
    lectures,
    deps,
    segments,
    row,
    plans,
    voiceJobs,
    stored,
    published,
    synthesised: () => synthesised,
  };
}

/** The board service over the same fakes; boards on unless a test turns them off. */
const boardService = (
  f: ReturnType<typeof fakes>,
  llm: FakeLlmAdapter = new FakeLlmAdapter(),
  enabled = true,
) =>
  new LectureBoardService(
    f.lectures,
    llm,
    f.deps.calls,
    f.deps.queue as never,
    f.deps.events as never,
    new ConfigService({ LECTURE_BOARD_ENABLED: enabled ? 'true' : 'false' }),
  );

const chapterProcessor = (
  f: ReturnType<typeof fakes>,
  llm: FakeLlmAdapter = new FakeLlmAdapter(),
  boards: LectureBoardService = boardService(f, llm),
) =>
  new LectureChapterProcessor(
    f.deps.documents as never,
    f.deps.pages as never,
    f.deps.topics as never,
    f.lectures,
    f.deps.calls,
    llm,
    f.deps.queue as never,
    f.deps.events as never,
    boards,
  );

const voiceProcessor = (
  f: ReturnType<typeof fakes>,
  boards: LectureBoardService = boardService(f),
) =>
  new LectureVoiceProcessor(
    f.deps.documents as never,
    f.lectures,
    f.deps.calls,
    f.deps.speech,
    f.deps.storage as never,
    f.deps.events as never,
    new ConfigService({}),
    boards,
  );

const chapterJob = (
  topicId = TOPIC.id,
  orderIndex = 0,
  style: LectureStyle = 'steady',
  startAtPage?: number,
) => ({
  documentId: doc.id,
  contentVersion: doc.contentVersion,
  topicId,
  orderIndex,
  style,
  ...(startAtPage ? { startAtPage } : {}),
});

/** Two chapters of two pages each, for the tests about the thread between them. */
const TWO_TOPICS = [
  { ...TOPIC, id: 'topic-1', title: 'Inflation', startPage: 1, endPage: 2 },
  {
    ...TOPIC,
    id: 'topic-2',
    title: 'Deflation',
    startPage: 3,
    endPage: 4,
    orderIndex: 1,
  },
];
const FOUR_PAGES = { 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE, 4: REAL_PAGE };

const voiceJob = (
  pageNumber: number,
  style: LectureStyle = 'steady',
  kind?: SegmentKind,
) => ({
  documentId: doc.id,
  contentVersion: doc.contentVersion,
  pageNumber,
  style,
  ...(kind ? { kind } : {}),
});

/** A planner that gives every page the same moves. */
function plannerWithMoves(moves: string[]) {
  const inner = new FakeLlmAdapter();
  return async (input: Parameters<FakeLlmAdapter['lectureOutline']>[0]) => {
    const result = await inner.lectureOutline(input);
    for (const beat of result.value.beats) beat.moves = moves;
    return result;
  };
}

describe('LectureChapterProcessor', () => {
  it('writes a chapter page by page, in order', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    await chapterProcessor(f).process(chapterJob(), CONTEXT);

    expect(f.segments.values().map((s) => s.status)).toEqual([
      'voicing',
      'voicing',
      'voicing',
    ]);
    expect(f.voiceJobs.map((job) => job.pageNumber)).toEqual([1, 2, 3]);
    expect(f.voiceJobs.every((job) => job.style === 'steady')).toBe(true);
  });

  it('gives every page after the first the tail of the one before it', async () => {
    // THE regression test. Pages used to be written concurrently, so this
    // tail was empty and each page was written blind to its predecessor.
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const tails: { page: number; tail: string }[] = [];
    let page = 0;
    llm.lectureSegment = (input) => {
      page += 1;
      tails.push({ page, tail: input.prevTail });
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(tails[0].tail).toBe('');
    expect(tails[1].tail.length).toBeGreaterThan(0);
    expect(tails[2].tail.length).toBeGreaterThan(0);
    // ...and the tail is genuinely the previous page's words.
    expect(f.segments.get(1)!.scriptText).toContain(tails[1].tail.slice(-40));
  });

  it('opens the chapter once and closes it once', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const places: { first: boolean; last: boolean }[] = [];
    llm.lectureSegment = (input) => {
      places.push({
        first: input.isFirstOfTopic,
        last: input.isLastOfTopic,
      });
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(places.map((p) => p.first)).toEqual([true, false, false]);
    expect(places.map((p) => p.last)).toEqual([false, false, true]);
  });

  it('fails one page alone and keeps writing the rest', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    // Page 2 can never be written: all three attempts stray off the page
    // with an invented figure, the one thing that still fails a page.
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      if (seen >= 2 && seen <= 4) {
        return Promise.resolve(
          draft('UNGROUNDED invention: 4096 widgets in 1913.'),
        );
      }
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(f.segments.get(2)!.status).toBe('failed');
    expect(f.segments.get(3)!.status).toBe('voicing');
    expect(f.voiceJobs.map((job) => job.pageNumber)).toEqual([1, 3]);
    expect(f.published).toContainEqual({
      type: 'lecture.segment_failed',
      pageNumber: 2,
      style: 'steady',
    });
  });

  it('takes the tail from the nearest page that actually has words', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const tails: string[] = [];
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      tails.push(input.prevTail);
      // Page 2 fails every attempt, leaving a hole between 1 and 3.
      if (seen >= 2 && seen <= 4) {
        return Promise.resolve(
          draft('UNGROUNDED invention: 4096 widgets in 1913.'),
        );
      }
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    // Page 3's tail (the last call) came from page 1, not from the hole.
    expect(tails.at(-1)).toContain(f.segments.get(1)!.scriptText!.slice(-30));
  });

  it('resumes a retried chapter instead of rewriting what it has', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    const processor = chapterProcessor(f);
    await processor.process(chapterJob(), CONTEXT);

    const llm = new FakeLlmAdapter();
    let rewrites = 0;
    llm.lectureSegment = (input) => {
      rewrites += 1;
      return new FakeLlmAdapter().lectureSegment(input);
    };
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(rewrites).toBe(0);
  });

  it('plans a chapter once, however many times it runs', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    let planned = 0;
    llm.lectureOutline = (input) => {
      planned += 1;
      return inner.lectureOutline(input);
    };

    const processor = chapterProcessor(f, llm);
    await processor.process(chapterJob(), CONTEXT);
    await processor.process(chapterJob(), CONTEXT);

    expect(planned).toBe(1);
  });

  it('ignores a job left over from a previous version of the document', async () => {
    const f = fakes({ 1: REAL_PAGE });
    await chapterProcessor(f).process(
      { ...chapterJob(), contentVersion: 1 },
      CONTEXT,
    );
    expect(f.plans.size).toBe(0);
    expect(f.voiceJobs).toHaveLength(0);
  });

  it('asks the last attempt to stay strictly on the page rather than leave a hole', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = withoutBoard(new FakeLlmAdapter());
    const inner = new FakeLlmAdapter();
    const stricts: boolean[] = [];
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      stricts.push(Boolean(input.strict));
      if (seen < 3) return Promise.resolve(draft('UNGROUNDED invention'));
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(stricts).toEqual([false, false, true]);
    expect(f.segments.get(1)!.status).toBe('voicing');
  });

  it('gives the verifier the plan, the previous words and the neighbouring pages', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const seen: { plan: string; prevTail: string; neighbours: number[] }[] = [];
    llm.lectureVerify = (input) => {
      seen.push({
        plan: input.context.plan,
        prevTail: input.context.prevTail,
        neighbours: input.context.neighbours.map((page) => page.pageNumber),
      });
      return inner.lectureVerify(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    // The first check is the hook itself, against the opening page with
    // the rest of the chapter alongside; then one per page.
    expect(seen.map((s) => s.neighbours)).toEqual([[2, 3], [2], [1, 3], [2]]);
    expect(seen[2].plan).toContain('Why Inflation matters.');
    expect(seen[2].plan).toContain('Teach page 2.');
    expect(seen[1].prevTail).toBe('');
    expect(seen[2].prevTail.length).toBeGreaterThan(0);
  });

  it('shows a later chapter how the earlier ones opened, so it opens differently', async () => {
    const f = fakes(FOUR_PAGES, TWO_TOPICS);
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const planned: string[][] = [];
    llm.lectureOutline = (input) => {
      planned.push(input.priorOpenings);
      return inner.lectureOutline(input);
    };

    const processor = chapterProcessor(f, llm);
    await processor.process(chapterJob('topic-1', 0), CONTEXT);
    await processor.process(chapterJob('topic-2', 1), CONTEXT);

    expect(planned[0]).toEqual([]);
    expect(planned[1]).toHaveLength(1);
    expect(planned[1][0]).toMatch(
      /^Why Inflation matters\. (?:\[write 1\] )?Teach page 1\./,
    );
  });

  it('speaks the planned hook word for word and hands the writer the words already spoken', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const openings: (string | null)[] = [];
    const tails: string[] = [];
    llm.lectureSegment = (input) => {
      openings.push(input.opening);
      tails.push(input.prevTail);
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(f.segments.get(1)!.scriptText).toMatch(
      /^Why Inflation matters\. (?:\[write 1\] )?Teach page 1\./,
    );
    expect(openings).toEqual(['Why Inflation matters.', null]);
    expect(tails[0]).toBe('');
  });

  it('sends back a page that opens with Imagine, with the reason and without a verifier call', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const calls: { styleCorrection?: string; strict?: boolean }[] = [];
    let verified = 0;
    llm.lectureVerify = (input) => {
      verified += 1;
      return inner.lectureVerify(input);
    };
    llm.lectureSegment = (input) => {
      calls.push({
        styleCorrection: input.styleCorrection,
        strict: input.strict,
      });
      if (calls.length === 1) {
        return Promise.resolve(
          draft('Imagine a bank with no vault. Money got scarce.'),
        );
      }
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(calls).toHaveLength(2);
    expect(calls[1].styleCorrection).toMatch(/Imagine/);
    expect(calls[1].strict).toBe(false);
    // One check for the hook, one for the page that was kept; none for
    // the page that was sent back.
    expect(verified).toBe(2);
    expect(f.segments.get(1)!.scriptText).not.toContain('Imagine');
  });

  it('keeps a page that never stops opening with Imagine rather than leaving a hole', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const stricts: boolean[] = [];
    llm.lectureSegment = (input) => {
      stricts.push(Boolean(input.strict));
      return Promise.resolve(
        draft('Imagine a bank with no vault. Money got scarce.'),
      );
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(stricts).toEqual([false, false, false]);
    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(f.segments.get(1)!.scriptText).toBe(
      'Why Inflation matters. Imagine a bank with no vault. Money got scarce.',
    );
  });

  it('asks for a shorter page when the writer runs long, and holds a light page to less', async () => {
    const long = (n: number) =>
      `Prices rise. ${Array(n).fill('word').join(' ')}.`;
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = async (input) => {
      const result = await inner.lectureOutline(input);
      result.value.beats[1].weight = 'light';
      return result;
    };
    const corrections: (string | undefined)[] = [];
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      corrections.push(input.styleCorrection);
      if (seen === 1) return Promise.resolve(draft(long(300)));
      if (seen === 3) return Promise.resolve(draft(long(140)));
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(corrections[1]).toMatch(/Too long: 30\d words/);
    expect(corrections[3]).toMatch(/Too long: 14\d words/);
    expect(f.segments.values().map((s) => s.status)).toEqual([
      'voicing',
      'voicing',
    ]);
  });

  it('passes the planner its own mistake when the hook is not fit to be spoken', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const corrections: (string | undefined)[] = [];
    let opening: string | null | undefined;
    llm.lectureOutline = async (input) => {
      corrections.push(input.correction);
      const result = await inner.lectureOutline(input);
      if (corrections.length === 1) {
        result.value.hook = 'Imagine a world without prices.';
      }
      return result;
    };
    llm.lectureSegment = (input) => {
      opening = input.opening;
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(corrections).toHaveLength(2);
    expect(corrections[1]).toMatch(/Imagine/);
    expect(opening).toBe('Why Inflation matters.');
  });

  it('lets the writer open the chapter when the planner cannot produce a speakable hook', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = async (input) => {
      const result = await inner.lectureOutline(input);
      result.value.hook = 'Imagine a world without prices.';
      return result;
    };
    const writerSaw: { opening: string | null; first: boolean }[] = [];
    llm.lectureSegment = (input) => {
      writerSaw.push({ opening: input.opening, first: input.isFirstOfTopic });
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(writerSaw).toEqual([{ opening: null, first: true }]);
    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(
      (f.plans.get('topic-1')!.plan as { hookSpoken: boolean }).hookSpoken,
    ).toBe(false);
  });

  it('tells the writer what the chapter has taught and what is still to come', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const seen: { taught: string[]; coming: string[] }[] = [];
    llm.lectureSegment = (input) => {
      seen.push({ taught: input.taughtSoFar, coming: input.comingLater });
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(seen[0]).toEqual({
      taught: [],
      coming: ['Teach page 2.', 'Teach page 3.'],
    });
    expect(seen[1]).toEqual({
      taught: ['New on page 1.'],
      coming: ['Teach page 3.'],
    });
    expect(seen[2]).toEqual({
      taught: ['New on page 1.', 'New on page 2.'],
      coming: [],
    });
  });

  it('hands the planner what earlier chapters taught, or their subject when they are not planned yet', async () => {
    const f = fakes(FOUR_PAGES, TWO_TOPICS);
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const taught: string[][] = [];
    llm.lectureOutline = (input) => {
      taught.push(input.taughtEarlier);
      return inner.lectureOutline(input);
    };

    const processor = chapterProcessor(f, llm);
    await processor.process(chapterJob('topic-2', 1), CONTEXT);
    await processor.process(chapterJob('topic-1', 0), CONTEXT);

    expect(taught[0]).toEqual(['Inflation']);
    expect(taught[1]).toEqual([]);

    f.plans.delete('topic-2');
    await processor.process(chapterJob('topic-2', 1), CONTEXT);
    expect(taught[2]).toEqual([
      'You can now explain Inflation.',
      'New on page 1.',
      'New on page 2.',
    ]);
  });

  it('tells the writer when the page is built around a list', async () => {
    const bullets = ['Their roles include:']
      .concat(
        ['assess', 'stabilise', 'transport', 'communicate', 'coordinate'].map(
          (role) => `• ${role} the victims at the scene without delay`,
        ),
      )
      .join('\n');
    const f = fakes({ 1: bullets });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    let list: { items: number } | null | undefined;
    llm.lectureSegment = (input) => {
      list = input.list;
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(list).toEqual({ items: 5 });
  });

  it('hands each chapter a different opening shape', async () => {
    const f = fakes(FOUR_PAGES, TWO_TOPICS);
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const shapes: string[] = [];
    llm.lectureOutline = (input) => {
      shapes.push(input.suggestedShape.name);
      return inner.lectureOutline(input);
    };

    const processor = chapterProcessor(f, llm);
    await processor.process(chapterJob('topic-1', 0), CONTEXT);
    await processor.process(chapterJob('topic-2', 1), CONTEXT);

    expect(shapes).toHaveLength(2);
    expect(shapes[0]).not.toBe(shapes[1]);
  });

  it('marks every page failed when the chapter cannot be planned, so nothing waits forever', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    llm.lectureOutline = () => Promise.reject(new Error('model down'));

    await expect(
      chapterProcessor(f, llm).process(chapterJob(), CONTEXT),
    ).rejects.toThrow('model down');
    expect(f.segments.values().map((s) => s.status)).toEqual([
      'pending',
      'pending',
    ]);

    await chapterProcessor(f, llm).process(chapterJob(), FINAL);
    expect(f.segments.values().map((s) => s.status)).toEqual([
      'failed',
      'failed',
    ]);
    expect(
      f.published
        .filter((e) => e.type === 'lecture.segment_failed')
        .map((e) => e.pageNumber),
    ).toEqual([1, 2]);
  });

  it('keeps a page the verifier still objects to on the last attempt, when its figures are all in the material', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const stricts: boolean[] = [];
    llm.lectureVerify = (input) =>
      input.script === 'Why Inflation matters.'
        ? inner.lectureVerify(input)
        : Promise.resolve({
            value: { grounded: false, problems: ['Does not emphasize enough'] },
            usage: USAGE,
          });
    llm.lectureSegment = (input) => {
      stricts.push(Boolean(input.strict));
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(stricts).toEqual([false, false, true]);
    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(f.voiceJobs.map((job) => job.pageNumber)).toEqual([1]);
  });

  it('drops a page whose figures are nowhere in the material, whatever the verifier says', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = withoutBoard(new FakeLlmAdapter());
    const corrections: (string | undefined)[] = [];
    llm.lectureSegment = (input) => {
      corrections.push(input.correction);
      return Promise.resolve(
        draft('The money supply grew 4096 percent after 1913.'),
      );
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(corrections[1]).toContain('not in the material: 4096, 1913');
    expect(f.segments.get(1)!.status).toBe('failed');
    expect(f.voiceJobs).toEqual([]);
  });

  it('lets a figure through when a neighbouring page carries it', async () => {
    const f = fakes({
      1: `In 2010 the central bank changed course. ${REAL_PAGE}`,
      2: REAL_PAGE,
    });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    llm.lectureSegment = (input) =>
      input.prevTail
        ? Promise.resolve(draft('Since 2010 prices have risen every year.'))
        : inner.lectureSegment(input);

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(f.segments.get(2)!.status).toBe('voicing');
    expect(f.segments.get(2)!.scriptText).toContain('2010');
  });

  it('crosses a figure page in one line without a verifier call', async () => {
    const f = fakes({ 1: 'Figure 3.1' });
    const llm = new FakeLlmAdapter();
    let verified = 0;
    llm.lectureVerify = () => {
      verified += 1;
      return Promise.resolve({
        value: { grounded: true, problems: [] },
        usage: USAGE,
      });
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(verified).toBe(0);
  });

  // ── styles ───────────────────────────────────────────────────────────────

  it('writes each style as its own pages from one shared plan', async () => {
    const f = fakes(
      { 1: REAL_PAGE, 2: REAL_PAGE },
      [TOPIC],
      ['steady', 'brisk'],
    );
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    let planned = 0;
    const styles: string[] = [];
    llm.lectureOutline = (input) => {
      planned += 1;
      return inner.lectureOutline(input);
    };
    llm.lectureSegment = (input) => {
      styles.push(`${input.style}:${input.budget.max}`);
      return inner.lectureSegment(input);
    };

    const processor = chapterProcessor(f, llm);
    await processor.process(chapterJob(TOPIC.id, 0, 'steady'), CONTEXT);
    await processor.process(chapterJob(TOPIC.id, 0, 'brisk'), CONTEXT);

    expect(planned).toBe(1);
    expect(styles).toEqual([
      'steady:220',
      'steady:220',
      'brisk:140',
      'brisk:140',
    ]);
    expect(f.row(1, 'steady')!.status).toBe('voicing');
    expect(f.row(1, 'brisk')!.status).toBe('voicing');
    expect(f.voiceJobs).toEqual([
      { pageNumber: 1, style: 'steady' },
      { pageNumber: 2, style: 'steady' },
      { pageNumber: 1, style: 'brisk' },
      { pageNumber: 2, style: 'brisk' },
    ]);
  });

  it('gives the writer the direction of the style it is writing', async () => {
    const f = fakes({ 1: REAL_PAGE }, [TOPIC], ['gentle']);
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    let direction = '';
    llm.lectureSegment = (input) => {
      direction = input.styleDirection;
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );

    expect(direction).toContain('which just means');
    expect(direction).toContain('one example carried through');
  });

  it('starts at the page a learner switched on, then fills in the earlier pages', async () => {
    const f = fakes(
      { 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE },
      [TOPIC],
      ['steady', 'gentle'],
    );
    const processor = chapterProcessor(f);
    // The steady version exists; the learner was listening to it.
    await processor.process(chapterJob(TOPIC.id, 0, 'steady'), CONTEXT);

    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const written: { page: number; tail: string }[] = [];
    llm.lectureSegment = (input) => {
      written.push({
        page: Number(/page (\d)/.exec(input.beat.goal)?.[1]),
        tail: input.prevTail,
      });
      return inner.lectureSegment(input);
    };
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle', 2),
      CONTEXT,
    );

    // Page 2 first, for the learner waiting there; then 3; then back to 1.
    // (A slow learner's page is written up to three times while the
    // plain-words gate sends the fake's textbook words back.)
    expect([...new Set(written.map((w) => w.page))]).toEqual([2, 3, 1]);
    // Page 2 continues from what the learner just heard: the STEADY page 1.
    expect(written[0].tail).toContain(
      f.row(1, 'steady')!.scriptText!.slice(-30),
    );
    // Page 3 continues from the gentle page 2, now that it exists.
    expect(written[1].tail).toContain(
      f.row(2, 'gentle')!.scriptText!.slice(-30),
    );
    // Page 1 opens the chapter: nothing before it.
    expect(written.find((w) => w.page === 1)!.tail).toBe('');
    expect(f.row(1, 'gentle')!.scriptText).toMatch(/^Why Inflation matters\./);
  });

  it('sends back a page whose sections ignore the moves, then stores where each move begins', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = plannerWithMoves(['the problem', 'the mechanism']);
    const corrections: (string | undefined)[] = [];
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      corrections.push(input.styleCorrection);
      // First try: one section for a two-move page.
      if (seen === 1)
        return Promise.resolve(draft('Prices rise when money is easy.'));
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(corrections[1]).toMatch(/one section per move/);
    expect(corrections[1]).toContain('0: the problem; 1: the mechanism');
    const row = f.segments.get(1)!;
    expect(row.status).toBe('voicing');
    expect(row.moveOffsets).toHaveLength(2);
    expect(row.moveOffsets![0]).toBe(0);
    expect(row.scriptText!.slice(row.moveOffsets![1])).toMatch(
      /^(?:\[write 1\] )?Then the mechanism\./,
    );
  });

  it('in the gentle style, sends back two ideas in a row that both open on an example', async () => {
    const f = fakes({ 1: REAL_PAGE }, [TOPIC], ['gentle']);
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = plannerWithMoves(['the problem', 'the mechanism']);
    const corrections: (string | undefined)[] = [];
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      corrections.push(input.styleCorrection);
      if (seen === 1) {
        return Promise.resolve({
          value: {
            sections: [
              { move: 0, text: 'For example, a bakery raises its prices.' },
              { move: 1, text: 'Think of the bank printing more notes.' },
            ],
          },
          usage: USAGE,
        });
      }
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );

    expect(corrections[1]).toMatch(/Two ideas in a row open on an example/);
    expect(f.row(1, 'gentle')!.status).toBe('voicing');
  });

  it('lets the gentle style end on a second telling, and holds the others to landing', async () => {
    const recap = 'Prices rise. In summary, easy money lifts prices.';
    const run = async (style: LectureStyle) => {
      const f = fakes({ 1: REAL_PAGE }, [TOPIC], [style]);
      const llm = withoutBoard(new FakeLlmAdapter());
      const inner = new FakeLlmAdapter();
      const corrections: (string | undefined)[] = [];
      let seen = 0;
      llm.lectureSegment = (input) => {
        seen += 1;
        corrections.push(input.styleCorrection);
        if (seen === 1) return Promise.resolve(draft(recap));
        return inner.lectureSegment(input);
      };
      await chapterProcessor(f, llm).process(
        chapterJob(TOPIC.id, 0, style),
        CONTEXT,
      );
      return corrections;
    };

    expect(await run('gentle')).toEqual([undefined]);
    expect((await run('steady'))[1]).toMatch(/Ends on a recap/);
  });
});

describe('LectureChapterProcessor: the segments around a chapter', () => {
  it("writes a slow learner the chapter's words first and the check last, and voices them by kind", async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE }, [TOPIC], ['gentle']);
    f.seedExtras('gentle');
    await chapterProcessor(f).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );

    expect(f.row(1, 'gentle', 'terms')!.scriptText).toMatch(
      /^Words you will hear/,
    );
    expect(f.row(1, 'gentle', 'terms')!.status).toBe('voicing');
    expect(f.row(2, 'gentle', 'check')!.scriptText).toMatch(
      /check of what stuck/i,
    );
    expect(f.row(2, 'gentle', 'check')!.scriptText).toContain('[pause]');
    // The words go before the first page, the check after the last.
    expect(f.voiceJobs).toEqual([
      { pageNumber: 1, style: 'gentle', kind: 'terms' },
      { pageNumber: 1, style: 'gentle' },
      { pageNumber: 2, style: 'gentle' },
      { pageNumber: 2, style: 'gentle', kind: 'check' },
    ]);
    // The pages themselves are untouched by the extras.
    expect(f.row(1, 'gentle')!.scriptText).toMatch(/^Why Inflation matters\./);
  });

  it('gives a normal pace the check but not the words', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    f.seedExtras('steady');
    await chapterProcessor(f).process(chapterJob(), CONTEXT);
    expect(f.row(1, 'steady', 'terms')).toBeUndefined();
    expect(f.row(2, 'steady', 'check')!.status).toBe('voicing');
    expect(f.voiceJobs.at(-1)).toEqual({
      pageNumber: 2,
      style: 'steady',
      kind: 'check',
    });
  });

  it('fails the words when the plan names none, and writes the pages regardless', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE }, [TOPIC], ['gentle']);
    f.seedExtras('gentle');
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = async (input) => {
      const result = await inner.lectureOutline(input);
      return { ...result, value: { ...result.value, terms: [] } };
    };
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    expect(f.row(1, 'gentle', 'terms')!.status).toBe('failed');
    expect(f.published).toContainEqual({
      type: 'lecture.segment_failed',
      pageNumber: 1,
      style: 'gentle',
      kind: 'terms',
    });
    expect(f.row(1, 'gentle')!.status).toBe('voicing');
    expect(f.row(2, 'gentle', 'check')!.status).toBe('voicing');
  });

  it("asks for a prediction at the chapter's turn and nowhere else", async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    await chapterProcessor(f).process(chapterJob(), CONTEXT);
    expect(f.row(1)!.scriptText).not.toContain('[pause]');
    expect(f.row(2)!.scriptText).toContain('[pause]');
    // The voice hears a silence, never the word "pause".
    expect(scriptForTts(f.row(2)!.scriptText!)).not.toMatch(/\[|pause/);
  });

  it('fails the extras with the pages when the chapter cannot be planned', async () => {
    const f = fakes({ 1: REAL_PAGE }, [TOPIC], ['gentle']);
    f.seedExtras('gentle');
    const llm = new FakeLlmAdapter();
    llm.lectureOutline = () => Promise.reject(new Error('planner down'));
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      FINAL,
    );
    expect(f.row(1, 'gentle', 'terms')!.status).toBe('failed');
    expect(f.row(1, 'gentle', 'check')!.status).toBe('failed');
    expect(f.row(1, 'gentle')!.status).toBe('failed');
  });
});

describe('LectureChapterProcessor: plans from an earlier generator', () => {
  const oldPlan = {
    hook: 'Why Inflation matters.',
    arc: 'Old arc.',
    beats: [
      { pageNumber: 1, goal: 'Teach page 1.' },
      { pageNumber: 2, goal: 'Teach page 2.' },
    ],
  };

  it('plans a chapter again when nothing has been spoken from the old plan', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE }, [TOPIC], ['gentle']);
    f.plans.set(TOPIC.id, {
      status: 'done',
      plan: oldPlan,
      generatorVersion: 'lecture-1',
    });
    const llm = new FakeLlmAdapter();
    let planned = 0;
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = (input) => {
      planned += 1;
      return inner.lectureOutline(input);
    };
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    expect(planned).toBe(1);
    expect(f.plans.get(TOPIC.id)!.generatorVersion).toBe(
      LECTURE_GENERATOR_VERSION,
    );
    expect(
      (f.plans.get(TOPIC.id)!.plan as { terms: unknown[] }).terms,
    ).toHaveLength(1);
  });

  it('keeps the old plan once a style has words cut to it', async () => {
    const f = fakes(
      { 1: REAL_PAGE, 2: REAL_PAGE },
      [TOPIC],
      ['steady', 'gentle'],
    );
    f.plans.set(TOPIC.id, {
      status: 'done',
      plan: oldPlan,
      generatorVersion: 'lecture-1',
    });
    // The steady pages were spoken from the old plan.
    f.row(1, 'steady')!.scriptText = 'Spoken already.';
    f.row(1, 'steady')!.status = 'done';
    const llm = new FakeLlmAdapter();
    let planned = 0;
    llm.lectureOutline = () => {
      planned += 1;
      return Promise.reject(new Error('should not plan'));
    };
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    expect(planned).toBe(0);
    expect(f.row(1, 'gentle')!.scriptText).toMatch(/^Why Inflation matters\./);
  });

  it('reuses a plan whose generator matches, or is unknown', async () => {
    const f = fakes({ 1: REAL_PAGE });
    f.plans.set(TOPIC.id, { status: 'done', plan: oldPlan });
    const llm = new FakeLlmAdapter();
    llm.lectureOutline = () => Promise.reject(new Error('should not plan'));
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    expect(f.row(1)!.status).toBe('voicing');
  });
});

describe('LectureChapterProcessor: a long gentle page voiced as two pieces', () => {
  const A = 'Prices rise when money is easy to borrow. ';
  const B = 'Banks lend more when rates are low. ';
  const C = 'Wages follow prices with a lag. ';
  /** Three moves, about a hundred and eight words each: past gentle's budget. */
  const long = () =>
    Promise.resolve({
      value: {
        sections: [A, B, C].map((sentence, move) => ({
          move,
          text: sentence.repeat(move === 0 ? 14 : 16).trim(),
        })),
      },
      usage: USAGE,
    });

  it('cuts the page at the move boundary nearest the middle, and voices both pieces', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE }, [TOPIC], ['gentle']);
    const llm = withoutBoard(new FakeLlmAdapter());
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = plannerWithMoves(['the rise', 'the banks', 'the lag']);
    llm.lectureSegment = (input) =>
      input.pageText === REAL_PAGE && input.beat.goal.includes('page 1')
        ? long()
        : inner.lectureSegment(input);
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );

    const page = f.row(1, 'gentle')!;
    const part = f.row(1, 'gentle', 'part')!;
    expect(page.scriptText).toMatch(/^Why Inflation matters\./);
    expect(page.scriptText).toContain(A.trim());
    expect(page.scriptText).not.toContain(C.trim());
    expect(part.scriptText).toContain(B.trim());
    expect(part.scriptText).toContain(C.trim());
    expect(part.status).toBe('voicing');
    expect(part.seq).toBe(page.seq);
    // Offsets are relative to each piece: both start at zero.
    expect(page.moveOffsets).toEqual([0]);
    expect(part.moveOffsets![0]).toBe(0);
    expect(part.moveOffsets).toHaveLength(2);
    expect(f.voiceJobs.slice(0, 2)).toEqual([
      { pageNumber: 1, style: 'gentle' },
      { pageNumber: 1, style: 'gentle', kind: 'part' },
    ]);
  });

  it('continues the next page from the second piece, the last thing heard', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE }, [TOPIC], ['gentle']);
    const llm = withoutBoard(new FakeLlmAdapter());
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = plannerWithMoves(['the rise', 'the banks', 'the lag']);
    const tails: string[] = [];
    llm.lectureSegment = (input) => {
      tails.push(input.prevTail);
      return input.beat.goal.includes('page 1')
        ? long()
        : inner.lectureSegment(input);
    };
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    // Page 2's tail is the last non-empty one: page 1 may be written more
    // than once, each time from nothing.
    const pageTwoTail = tails.filter(Boolean).pop() ?? '';
    expect(pageTwoTail).toContain(C.trim());
    expect(pageTwoTail).not.toContain(A.trim());
  });

  it('leaves a short gentle page, and a long page in any other style, whole', async () => {
    const short = fakes({ 1: REAL_PAGE }, [TOPIC], ['gentle']);
    const llm = withoutBoard(new FakeLlmAdapter());
    llm.lectureOutline = plannerWithMoves(['the rise', 'the banks', 'the lag']);
    await chapterProcessor(short, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    expect(short.row(1, 'gentle', 'part')).toBeUndefined();

    const steady = fakes({ 1: REAL_PAGE });
    const longLlm = new FakeLlmAdapter();
    longLlm.lectureOutline = plannerWithMoves([
      'the rise',
      'the banks',
      'the lag',
    ]);
    longLlm.lectureSegment = () => long();
    await chapterProcessor(steady, longLlm).process(chapterJob(), CONTEXT);
    expect(steady.row(1, 'steady', 'part')).toBeUndefined();
    expect(steady.row(1)!.scriptText).toContain(C.trim());
  });

  it('asks for the audio again of a row that kept its words but lost its voice', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    f.seedExtras('steady');
    const kept = f.row(1)!;
    kept.scriptText = 'Words already written.';
    kept.status = 'pending';
    // A row still marked voicing whose job vanished with a worker restart.
    const lost = f.row(2, 'steady', 'check')!;
    lost.scriptText = 'A check whose voice job was lost.';
    lost.status = 'voicing';
    const llm = withoutBoard(new FakeLlmAdapter());
    const written: string[] = [];
    llm.lectureSegment = (input) => {
      written.push(input.beat.goal);
      return new FakeLlmAdapter().lectureSegment(input);
    };
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    expect(f.voiceJobs.slice(0, 2)).toEqual([
      { pageNumber: 1, style: 'steady' },
      { pageNumber: 2, style: 'steady', kind: 'check' },
    ]);
    expect(kept.scriptText).toBe('Words already written.');
    expect(lost.scriptText).toBe('A check whose voice job was lost.');
    expect(written).toEqual(['Teach page 2.']);
  });
});

describe('LectureVoiceProcessor: how each style is delivered', () => {
  it('tells the voice to slow down for a slow learner, and keeps the audio apart per delivery', async () => {
    const f = fakes({ 1: REAL_PAGE }, [TOPIC], ['gentle', 'brisk']);
    for (const style of ['gentle', 'brisk'] as const) {
      const row = f.row(1, style)!;
      row.scriptText = 'The same words, delivered two ways.';
      row.status = 'voicing';
      await voiceProcessor(f).process(voiceJob(1, style), CONTEXT);
    }
    const [gentle, brisk] = f.voiced;
    expect(gentle.instructions).toMatch(/slowly/i);
    expect(gentle.speed).toBeLessThan(1);
    expect(brisk.instructions).toMatch(/brisk/i);
    expect(brisk.speed).toBeGreaterThan(1);
    // Same words, different delivery: different files.
    const keys = ['gentle', 'brisk'].map((style) =>
      f
        .row(1, style as 'gentle' | 'brisk')!
        .audioKey!.split('-')
        .at(-1),
    );
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe('LectureVoiceProcessor: the segments around a chapter', () => {
  it("keeps a check's audio apart from its page's, and says which arrived", async () => {
    const f = fakes({ 1: REAL_PAGE });
    f.seedExtras('steady');
    const check = f.row(1, 'steady', 'check')!;
    check.scriptText = 'That is inflation. A check of what stuck.';
    check.status = 'voicing';

    await voiceProcessor(f).process(voiceJob(1, 'steady', 'check'), CONTEXT);

    expect(check.status).toBe('done');
    expect(check.audioKey).toContain('/1-check-steady-');
    expect(f.published).toContainEqual({
      type: 'lecture.segment_ready',
      pageNumber: 1,
      style: 'steady',
      kind: 'check',
    });
    // The page shares the number and is not touched.
    expect(f.row(1)!.status).toBe('pending');
  });
});

describe('LectureVoiceProcessor', () => {
  async function written(
    pageText: Record<number, string>,
    style: LectureStyle = 'steady',
  ) {
    const f = fakes(pageText, [TOPIC], [style]);
    await chapterProcessor(f).process(chapterJob(TOPIC.id, 0, style), CONTEXT);
    return f;
  }

  it('voices a written script and announces that the page is playable', async () => {
    const f = await written({ 1: REAL_PAGE });
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);

    const row = f.segments.get(1)!;
    expect(row.status).toBe('done');
    expect(row.audioKey).toBeTruthy();
    expect(row.durationMs).toBeGreaterThan(0);
    expect(f.published).toContainEqual({
      type: 'lecture.segment_ready',
      pageNumber: 1,
      style: 'steady',
      kind: 'page',
    });
  });

  it('keys the audio by version, style, voice, model, generator and the words spoken', async () => {
    const f = await written({ 1: REAL_PAGE });
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);

    expect(f.stored[0]).toMatch(
      new RegExp(
        `^documents/doc-1/lecture/v2/1-steady-alloy-gpt-4o-mini-tts-${LECTURE_GENERATOR_VERSION}-[0-9a-f]{10}\\.mp3$`,
      ),
    );
  });

  it('voices each style to its own file', async () => {
    const f = await written({ 1: REAL_PAGE }, 'brisk');
    await voiceProcessor(f).process(voiceJob(1, 'brisk'), CONTEXT);

    expect(f.stored[0]).toContain('/1-brisk-');
    expect(f.row(1, 'brisk')!.status).toBe('done');
  });

  it('voices a page written again afresh, under a different key', async () => {
    const f = await written({ 1: REAL_PAGE });
    const processor = voiceProcessor(f);
    await processor.process(voiceJob(1), CONTEXT);

    const row = f.segments.get(1)!;
    row.scriptText = 'Entirely different words this time.';
    row.status = 'voicing';
    row.audioKey = null;
    await processor.process(voiceJob(1), CONTEXT);

    expect(f.synthesised()).toBe(2);
    expect(f.stored).toHaveLength(2);
    expect(f.stored[1]).not.toBe(f.stored[0]);
  });

  it('never synthesises the same page twice', async () => {
    const f = await written({ 1: REAL_PAGE });
    const processor = voiceProcessor(f);
    await processor.process(voiceJob(1), CONTEXT);
    await processor.process(voiceJob(1), CONTEXT);
    expect(f.synthesised()).toBe(1);
  });

  it('does nothing for a page whose script does not exist yet', async () => {
    const f = fakes({ 1: REAL_PAGE });
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);
    expect(f.synthesised()).toBe(0);
    expect(f.segments.get(1)!.status).toBe('pending');
  });

  it('never clobbers the script it voices', async () => {
    const f = await written({ 1: REAL_PAGE });
    const script = f.segments.get(1)!.scriptText;
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);
    expect(f.segments.get(1)!.scriptText).toBe(script);
  });

  it('marks a page failed and says so when synthesis gives up', async () => {
    const f = await written({ 1: REAL_PAGE });
    f.deps.speech.synthesize = () => Promise.reject(new Error('tts down'));

    await voiceProcessor(f).process(voiceJob(1), FINAL);

    expect(f.segments.get(1)!.status).toBe('failed');
    expect(f.published).toContainEqual({
      type: 'lecture.segment_failed',
      pageNumber: 1,
      style: 'steady',
      kind: 'page',
    });
  });
});

describe('the lecture board around the chapter processor', () => {
  it('writes a board for each page from its accepted script, ready at once on the estimate, and none for a bridge', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: 'short', 3: REAL_PAGE });
    await chapterProcessor(f).process(chapterJob(), CONTEXT);
    const page = f.row(1)!;
    expect(page.boardStatus).toBe('done');
    const timeline = page.board as BoardTimeline;
    expect(timeline.version).toBe(1);
    expect(timeline.timing).toBe('estimated');
    expect(timeline.ops.some((op) => op.kind === 'heading')).toBe(true);
    expect(timeline.ops.some((op) => op.kind === 'term')).toBe(true);
    expect(timeline.ops.every((op) => op.t0Ms !== null)).toBe(true);
    expect(f.row(2)!.boardStatus).toBe('skipped');
    // Every page shipped regardless.
    expect(f.row(1)!.status).toBe('voicing');
    expect(f.row(3)!.status).toBe('voicing');
  });

  it('never lets a broken board writer touch the page', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = withoutBoard(new FakeLlmAdapter());
    // The planner is down, so the page is written without its board and
    // the board writer is asked afterwards, the older way; it is down too.
    llm.lectureBoardPlan = () =>
      Promise.reject(new Error('board planner down'));
    llm.lectureBoard = () => Promise.reject(new Error('board model down'));
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    expect(f.row(1)!.status).toBe('voicing');
    expect(f.row(1)!.boardStatus).toBe('failed');
    expect(f.published).toContainEqual({
      type: 'lecture.board_failed',
      pageNumber: 1,
      style: 'steady',
      kind: 'page',
    });
  });

  it('writes deterministic boards for the words and the check', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE }, [TOPIC], ['gentle']);
    f.seedExtras('gentle');
    await chapterProcessor(f).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    const terms = f.row(1, 'gentle', 'terms')!;
    expect(terms.boardStatus).toBe('done');
    expect(
      (terms.board as BoardTimeline).ops.some((op) => op.kind === 'term'),
    ).toBe(true);
    const check = f.row(2, 'gentle', 'check')!;
    expect(check.boardStatus).toBe('done');
    expect(
      (check.board as BoardTimeline).ops.filter((op) => op.kind === 'point')
        .length,
    ).toBeGreaterThan(0);
  });

  it('asks for the drawing only where the plan marked a figure', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    const llm = withoutBoard(new FakeLlmAdapter());
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = async (input) => {
      const result = await inner.lectureOutline(input);
      return {
        ...result,
        value: {
          ...result.value,
          beats: result.value.beats.map((beat, index) => ({
            ...beat,
            figure:
              index === 0
                ? {
                    kind: 'process' as const,
                    shows: 'money flowing through the banks',
                  }
                : { kind: 'none' as const, shows: null },
          })),
        },
      };
    };
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    expect(f.diagramJobs).toEqual([{ pageNumber: 1, style: 'steady' }]);
  });

  it('leaves every row without a board when boards are off', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = withoutBoard(new FakeLlmAdapter());
    await chapterProcessor(f, llm, boardService(f, llm, false)).process(
      chapterJob(),
      CONTEXT,
    );
    expect(f.row(1)!.status).toBe('voicing');
    expect(f.row(1)!.boardStatus).toBe('none');
    expect(f.row(1)!.board).toBeNull();
  });
});

describe('the board after the audio', () => {
  const alignProcessor = (
    f: ReturnType<typeof fakes>,
    aligner = new FakeAlignerAdapter(),
  ) =>
    new LectureAlignProcessor(
      f.deps.documents as never,
      f.lectures,
      f.deps.storage as never,
      aligner,
      boardService(f),
    );

  it('asks for alignment once a row is voiced, then times the board and announces it', async () => {
    const f = fakes({ 1: REAL_PAGE });
    await chapterProcessor(f).process(chapterJob(), CONTEXT);
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);
    expect(f.alignJobs).toEqual([
      { pageNumber: 1, style: 'steady', kind: 'page' },
    ]);

    await alignProcessor(f).process({ ...voiceJob(1), kind: 'page' }, CONTEXT);
    const row = f.row(1)!;
    expect(row.boardStatus).toBe('done');
    const times = row.wordTimes as WordTimes;
    expect(times.source).toBe('echogarden-whisper');
    expect(times.audioKey).toBe(row.audioKey);
    const timeline = row.board as BoardTimeline;
    expect(timeline.timing).toBe('aligned');
    expect(
      timeline.ops.every((op) => op.t0Ms !== null && op.durMs !== null),
    ).toBe(true);
    expect(f.published).toContainEqual({
      type: 'lecture.board_ready',
      pageNumber: 1,
      style: 'steady',
      kind: 'page',
    });
  });

  it('times on the estimate when the aligner is off or its times fail the checks', async () => {
    const off = fakes({ 1: REAL_PAGE });
    await chapterProcessor(off).process(chapterJob(), CONTEXT);
    await voiceProcessor(off).process(voiceJob(1), CONTEXT);
    const aligner = new FakeAlignerAdapter();
    aligner.off = true;
    await alignProcessor(off, aligner).process(
      { ...voiceJob(1), kind: 'page' },
      CONTEXT,
    );
    expect((off.row(1)!.wordTimes as WordTimes).source).toBe('estimate');
    expect((off.row(1)!.board as BoardTimeline).timing).toBe('estimated');
    expect(off.row(1)!.boardStatus).toBe('done');

    const broken = fakes({ 1: REAL_PAGE });
    await chapterProcessor(broken).process(chapterJob(), CONTEXT);
    await voiceProcessor(broken).process(voiceJob(1), CONTEXT);
    const bad = new FakeAlignerAdapter();
    bad.broken = true;
    await alignProcessor(broken, bad).process(
      { ...voiceJob(1), kind: 'page' },
      CONTEXT,
    );
    expect((broken.row(1)!.wordTimes as WordTimes).source).toBe('estimate');
    expect(broken.row(1)!.boardStatus).toBe('done');
  });

  it('keeps sentence times for the rewind even on a row with nothing to write', async () => {
    const f = fakes({ 1: 'short' });
    await chapterProcessor(f).process(chapterJob(), CONTEXT);
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);
    await alignProcessor(f).process({ ...voiceJob(1), kind: 'page' }, CONTEXT);
    expect(f.row(1)!.boardStatus).toBe('skipped');
    expect((f.row(1)!.wordTimes as WordTimes).sentences.length).toBeGreaterThan(
      0,
    );
  });
});

describe('the diagram on a board', () => {
  const diagramProcessor = (
    f: ReturnType<typeof fakes>,
    llm = new FakeLlmAdapter(),
  ) =>
    new LectureDiagramProcessor(
      f.deps.documents as never,
      f.deps.pages as never,
      f.deps.topics as never,
      f.lectures,
      f.deps.calls,
      llm,
      boardService(f, llm),
    );
  const withFigure = (llm: FakeLlmAdapter) => {
    const inner = new FakeLlmAdapter();
    llm.lectureOutline = async (input) => {
      const result = await inner.lectureOutline(input);
      return {
        ...result,
        value: {
          ...result.value,
          beats: result.value.beats.map((beat, index) => ({
            ...beat,
            figure:
              index === 0
                ? { kind: 'process' as const, shows: 'the flow of money' }
                : { kind: 'none' as const, shows: null },
          })),
        },
      };
    };
    return llm;
  };

  it('draws the figure, lays it out, and attaches it to the board in narration order', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = withFigure(new FakeLlmAdapter());
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    await diagramProcessor(f, llm).process(
      { ...voiceJob(1), topicId: TOPIC.id },
      CONTEXT,
    );
    const timeline = f.row(1)!.board as BoardTimeline;
    expect(timeline.diagrams).toHaveLength(1);
    const op = timeline.ops.find((entry) => entry.kind === 'diagram');
    expect(op).toBeDefined();
    expect(op!.kind === 'diagram' && op!.elementOrder.length).toBe(
      timeline.diagrams[0].nodes.length + timeline.diagrams[0].edges.length,
    );
    expect(
      timeline.diagrams[0].nodes.every((node) => node.w > 0 && node.h > 0),
    ).toBe(true);
  });

  it("copies a sibling style's drawing rather than drawing twice, and re-times a timed board", async () => {
    const f = fakes({ 1: REAL_PAGE }, [TOPIC], ['steady', 'gentle']);
    const llm = withFigure(new FakeLlmAdapter());
    let drawn = 0;
    const inner = new FakeLlmAdapter();
    llm.lectureDiagram = (input) => {
      drawn += 1;
      return inner.lectureDiagram(input);
    };
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    await chapterProcessor(f, llm).process(
      chapterJob(TOPIC.id, 0, 'gentle'),
      CONTEXT,
    );
    await voiceProcessor(f).process(voiceJob(1, 'gentle'), CONTEXT);
    await new LectureAlignProcessor(
      f.deps.documents as never,
      f.lectures,
      f.deps.storage as never,
      new FakeAlignerAdapter(),
      boardService(f),
    ).process({ ...voiceJob(1, 'gentle'), kind: 'page' }, CONTEXT);
    expect(f.row(1, 'gentle')!.boardStatus).toBe('done');

    await diagramProcessor(f, llm).process(
      { ...voiceJob(1), topicId: TOPIC.id },
      CONTEXT,
    );
    await diagramProcessor(f, llm).process(
      { ...voiceJob(1, 'gentle'), topicId: TOPIC.id },
      CONTEXT,
    );
    expect(drawn).toBe(1);
    const gentle = f.row(1, 'gentle')!.board as BoardTimeline;
    expect(gentle.diagrams).toHaveLength(1);
    const op = gentle.ops.find((entry) => entry.kind === 'diagram')!;
    expect(op.t0Ms).not.toBeNull();
    expect(f.row(1, 'gentle')!.boardStatus).toBe('done');
  });

  it('leaves the board without a drawing when the plan cannot be drawn', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = withFigure(new FakeLlmAdapter());
    llm.lectureDiagram = () =>
      Promise.resolve({
        value: {
          title: 'Nothing',
          nodes: [
            {
              id: 'a',
              label: 'zebra giraffe',
              shape: null,
              anchor: 'not said anywhere',
            },
          ],
          edges: [],
          groups: [],
        },
        usage: USAGE,
      });
    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);
    await diagramProcessor(f, llm).process(
      { ...voiceJob(1), topicId: TOPIC.id },
      CONTEXT,
    );
    const timeline = f.row(1)!.board as BoardTimeline;
    expect(timeline.diagrams).toHaveLength(0);
    expect(f.row(1)!.boardStatus).toBe('done');
  });
});

describe('boards for a lecture written before boards existed', () => {
  const backfill = (f: ReturnType<typeof fakes>, llm = new FakeLlmAdapter()) =>
    new LectureBoardProcessor(
      f.deps.documents as never,
      f.deps.pages as never,
      f.deps.topics as never,
      f.lectures,
      boardService(f, llm),
    );

  it('writes the board from the stored words and asks for alignment, touching neither script nor audio', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE });
    const llm = withoutBoard(new FakeLlmAdapter());
    // Written and voiced without boards.
    await chapterProcessor(f, llm, boardService(f, llm, false)).process(
      chapterJob(),
      CONTEXT,
    );
    await voiceProcessor(f, boardService(f, llm, false)).process(
      voiceJob(1),
      CONTEXT,
    );
    const script = f.row(1)!.scriptText;
    const audio = f.row(1)!.audioKey;
    expect(f.row(1)!.boardStatus).toBe('none');

    await backfill(f, llm).process({ ...voiceJob(1), kind: 'page' }, CONTEXT);
    // Ready at once, on the estimate; the measurement is asked for.
    expect(f.row(1)!.boardStatus).toBe('done');
    expect((f.row(1)!.board as BoardTimeline).timing).toBe('estimated');
    expect(f.row(1)!.scriptText).toBe(script);
    expect(f.row(1)!.audioKey).toBe(audio);
    expect(f.alignJobs).toContainEqual({
      pageNumber: 1,
      style: 'steady',
      kind: 'page',
    });
    // A row not yet voiced is timed on the estimate at once.
    await backfill(f, llm).process({ ...voiceJob(2), kind: 'page' }, CONTEXT);
    expect(f.row(2)!.boardStatus).toBe('done');
    expect((f.row(2)!.board as BoardTimeline).timing).toBe('estimated');
  });
});
