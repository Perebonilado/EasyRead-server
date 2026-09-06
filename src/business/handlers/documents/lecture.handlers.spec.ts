import { ConfigService } from '@nestjs/config';
import {
  GenerateLectureHandler,
  LectureStatusHandler,
  SetLectureStyleHandler,
} from './lecture.handlers';
import { BOARD_GENERATOR_VERSION } from '../../domain/board';
import { LECTURE_STALE_MS } from '../../domain/lecture';
import type { LectureSegmentSeed } from '../../repositories/lecture.repository';

/**
 * Generation seeds the WHOLE lecture before it spends anything, so the
 * player can show its shape immediately and play order is document-global
 * rather than restarting at every chapter. Chapters go out in reading
 * order, because the student starts listening at the front.
 */

const TOPICS = [
  {
    id: 'topic-1',
    title: 'One',
    shortDescription: null,
    startPage: 1,
    endPage: 2,
    orderIndex: 0,
  },
  {
    id: 'topic-2',
    title: 'Two',
    shortDescription: null,
    startPage: 3,
    endPage: 4,
    orderIndex: 1,
  },
];

const PAGE = 'x'.repeat(400);

interface ExistingRow {
  topicId: string;
  pageNumber: number;
  status: string;
  /** When the row last moved; a row in flight too long counts as lost. */
  updatedAt?: Date;
}

interface HarnessOptions {
  topics?: typeof TOPICS;
  /** null models a document whose pages are not extracted yet. */
  pageCount?: number | null;
  pages?: number[];
  /** Rows a previous request already left behind. */
  existing?: ExistingRow[];
}

/** The page rows of a seeding; the extras around chapters are asserted apart. */
const pagesOf = (seeds: LectureSegmentSeed[]) =>
  seeds.filter((seed) => (seed.kind ?? 'page') === 'page');

function harness({
  topics = TOPICS,
  pageCount = 4,
  pages = [1, 2, 3, 4],
  existing = [],
}: HarnessOptions = {}) {
  const seeded: LectureSegmentSeed[] = [];
  const chapters: {
    topicId: string;
    orderIndex: number;
    style?: string;
    startAtPage?: number;
    priority?: number;
  }[] = [];
  const reset: string[][] = [];
  /** What happened to the repository, in order. */
  const events: string[] = [];
  const rows = [...existing];

  const handler = new GenerateLectureHandler(
    { listByDocument: () => Promise.resolve(topics) } as never,
    {
      findRange: () =>
        Promise.resolve(
          pages.map((pageNumber) => ({
            pageNumber,
            text: PAGE,
            isEmpty: false,
          })),
        ),
    } as never,
    {
      seedSegments: (input: { segments: LectureSegmentSeed[] }) => {
        seeded.push(...input.segments);
        events.push('seed');
        return Promise.resolve();
      },
      clear: (_d: string, style?: string) => {
        events.push(style ? `clear:${style}` : 'clear');
        rows.length = 0;
        return Promise.resolve();
      },
      listSegments: () => Promise.resolve(rows),
      resetFailedSegments: (_d: string, _v: number, topicIds: string[]) => {
        reset.push(topicIds);
        return Promise.resolve();
      },
    } as never,
    {
      enqueueLectureChapters: (
        jobs: {
          topicId: string;
          orderIndex: number;
          style?: string;
          startAtPage?: number;
        }[],
      ) => {
        chapters.push(...jobs);
        return Promise.resolve();
      },
    } as never,
    {
      require: () =>
        Promise.resolve({
          id: 'doc-1',
          contentVersion: 2,
          props: { pageCount },
        }),
    } as never,
    { assertStudyTime: () => Promise.resolve() } as never,
    {
      handle: () =>
        Promise.resolve({ data: { generated: true, totalSegments: 0 } }),
    } as never,
  );

  return { handler, seeded, chapters, reset, events };
}

const request = { userId: 'user-1', documentId: 'doc-1' };

describe('GenerateLectureHandler', () => {
  it('seeds every page before spending a single model call', async () => {
    const { handler, seeded } = harness();
    await handler.handle(request);
    expect(pagesOf(seeded).map((s) => s.pageNumber)).toEqual([1, 2, 3, 4]);
  });

  it('numbers play order across the whole document, not per chapter', async () => {
    const { handler, seeded } = harness();
    await handler.handle(request);
    const seqs = pagesOf(seeded).map((s) => s.seq);
    expect(seqs).toEqual([0, 1, 2, 3]);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('enqueues one chapter job per chapter, in reading order', async () => {
    const { handler, chapters } = harness();
    await handler.handle(request);
    expect(chapters).toEqual([
      {
        documentId: 'doc-1',
        contentVersion: 2,
        topicId: 'topic-1',
        orderIndex: 0,
        style: 'steady',
      },
      {
        documentId: 'doc-1',
        contentVersion: 2,
        topicId: 'topic-2',
        orderIndex: 1,
        style: 'steady',
      },
    ]);
  });

  it('skips a chapter that owns no pages rather than planning nothing', async () => {
    // Chapter two's range is beyond the pages the document actually has.
    const { handler, chapters } = harness({ pages: [1, 2], pageCount: 2 });
    await handler.handle(request);
    expect(chapters.map((c) => c.topicId)).toEqual(['topic-1']);
  });

  it('refuses a document whose pages are not extracted yet', async () => {
    const { handler } = harness({ pageCount: null });
    await expect(handler.handle(request)).rejects.toThrow(/chapters/i);
  });

  it('writes only the chapters asked for', async () => {
    const { handler, seeded, chapters } = harness();
    await handler.handle({ ...request, topicIds: ['topic-2'] });

    expect(pagesOf(seeded).map((s) => s.pageNumber)).toEqual([3, 4]);
    expect(chapters.map((c) => c.topicId)).toEqual(['topic-2']);
  });

  it('keeps play order document-global when only part is written', async () => {
    // THE thing that must not break. Numbering the selection on its own
    // would give chapter two's first page seq 0, and a chapter added
    // later would collide with it and shuffle the lecture.
    const { handler, seeded } = harness();
    await handler.handle({ ...request, topicIds: ['topic-2'] });

    expect(pagesOf(seeded).map((s) => s.seq)).toEqual([2, 3]);
  });

  it('lets a second request add chapters without renumbering the first', async () => {
    const { handler, seeded } = harness();
    await handler.handle({ ...request, topicIds: ['topic-2'] });
    const first = pagesOf(seeded).map((s) => ({
      page: s.pageNumber,
      seq: s.seq,
    }));
    seeded.length = 0;

    await handler.handle({ ...request, topicIds: ['topic-1'] });
    const second = pagesOf(seeded).map((s) => ({
      page: s.pageNumber,
      seq: s.seq,
    }));

    expect(first).toEqual([
      { page: 3, seq: 2 },
      { page: 4, seq: 3 },
    ]);
    expect(second).toEqual([
      { page: 1, seq: 0 },
      { page: 2, seq: 1 },
    ]);
    // Together they are still one dense, ascending lecture.
    const all = [...second, ...first].map((entry) => entry.seq);
    expect(all).toEqual([0, 1, 2, 3]);
  });

  it('treats an empty selection as the whole document', async () => {
    const { handler, seeded } = harness();
    await handler.handle({ ...request, topicIds: [] });
    expect(pagesOf(seeded)).toHaveLength(4);
  });

  it('refuses a selection with nothing to lecture on', async () => {
    const { handler } = harness();
    await expect(
      handler.handle({ ...request, topicIds: ['topic-nonexistent'] }),
    ).rejects.toThrow(/anything to lecture on/i);
  });

  it('gives the failed pages of a finished chapter another chance when asked again', async () => {
    const { handler, reset, chapters } = harness({
      existing: [
        { topicId: 'topic-1', pageNumber: 1, status: 'done' },
        { topicId: 'topic-1', pageNumber: 2, status: 'failed' },
        { topicId: 'topic-2', pageNumber: 3, status: 'failed' },
        { topicId: 'topic-2', pageNumber: 4, status: 'writing' },
      ],
    });
    await handler.handle({ ...request, topicIds: ['topic-1', 'topic-2'] });

    // Chapter one finished with a hole in it, so its failed page goes back
    // to pending. Chapter two is still being written and reaches its own
    // unwritten pages by itself, so it is left alone.
    expect(reset).toEqual([['topic-1']]);
    // Both chapter jobs still go out; the queue replaces a finished job of
    // the same name and dedupes against a running one.
    expect(chapters.map((c) => c.topicId)).toEqual(['topic-1', 'topic-2']);
  });

  it('treats a chapter lost in flight as failed, so it can be asked for again', async () => {
    const lost = new Date(Date.now() - LECTURE_STALE_MS * 3);
    const { handler, reset, chapters } = harness({
      existing: [
        { topicId: 'topic-1', pageNumber: 1, status: 'done' },
        {
          topicId: 'topic-1',
          pageNumber: 2,
          status: 'voicing',
          updatedAt: lost,
        },
        { topicId: 'topic-2', pageNumber: 3, status: 'done' },
        {
          topicId: 'topic-2',
          pageNumber: 4,
          status: 'voicing',
          updatedAt: new Date(),
        },
      ],
    });
    await handler.handle({ ...request, topicIds: ['topic-1', 'topic-2'] });

    // Chapter one's voicing died with its worker: the chapter is finished
    // with a hole and goes again. Chapter two is genuinely still moving.
    expect(reset).toEqual([['topic-1']]);
    expect(chapters.map((c) => c.topicId)).toEqual(['topic-1', 'topic-2']);
  });

  it('lets a lecture lost in flight be rewritten', async () => {
    const lost = new Date(Date.now() - LECTURE_STALE_MS * 3);
    const { handler, events } = harness({
      existing: [
        {
          topicId: 'topic-1',
          pageNumber: 1,
          status: 'writing',
          updatedAt: lost,
        },
      ],
    });
    await handler.handle({ ...request, rewrite: true });
    expect(events[0]).toBe('clear:steady');
  });

  it('resets nothing on a first request, or when nothing failed', async () => {
    const fresh = harness();
    await fresh.handler.handle(request);
    expect(fresh.reset).toEqual([]);

    const clean = harness({
      existing: [
        { topicId: 'topic-1', pageNumber: 1, status: 'done' },
        { topicId: 'topic-1', pageNumber: 2, status: 'done' },
      ],
    });
    await clean.handler.handle({ ...request, topicIds: ['topic-1'] });
    expect(clean.reset).toEqual([]);
  });

  it('discards the lecture before writing the whole document again on a rewrite', async () => {
    const { handler, seeded, chapters, reset, events } = harness({
      existing: [
        { topicId: 'topic-1', pageNumber: 1, status: 'done' },
        { topicId: 'topic-1', pageNumber: 2, status: 'failed' },
        { topicId: 'topic-2', pageNumber: 3, status: 'done' },
        { topicId: 'topic-2', pageNumber: 4, status: 'done' },
      ],
    });
    // A selection is ignored: a rewrite is always the whole document.
    await handler.handle({ ...request, rewrite: true, topicIds: ['topic-1'] });

    expect(events).toEqual(['clear:steady', 'seed']);
    expect(pagesOf(seeded).map((s) => s.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(chapters.map((c) => c.topicId)).toEqual(['topic-1', 'topic-2']);
    // Nothing to reset: the failed row went with the rest.
    expect(reset).toEqual([]);
  });

  it('refuses to rewrite while a chapter is still being written', async () => {
    const { handler, events } = harness({
      existing: [
        { topicId: 'topic-1', pageNumber: 1, status: 'done' },
        { topicId: 'topic-1', pageNumber: 2, status: 'writing' },
      ],
    });
    await expect(handler.handle({ ...request, rewrite: true })).rejects.toThrow(
      /still being written/,
    );
    expect(events).not.toContain('clear');
  });

  it('seeds and queues the style asked for, and only that style', async () => {
    const { handler, seeded, chapters } = harness();
    await handler.handle({ ...request, style: 'brisk' });
    expect(seeded.every((s) => s.style === 'brisk')).toBe(true);
    expect(chapters.map((c) => c.style)).toEqual(['brisk', 'brisk']);
  });

  it('rewrites one style and leaves the others alone', async () => {
    const { handler, events } = harness({
      existing: [{ topicId: 'topic-1', pageNumber: 1, status: 'done' }],
    });
    await handler.handle({ ...request, rewrite: true, style: 'gentle' });
    expect(events[0]).toBe('clear:gentle');
  });

  it('puts the chapter a learner is waiting in first, starting at their page', async () => {
    const { handler, chapters } = harness();
    await handler.handle({ ...request, style: 'brisk', startAtPage: 3 });
    expect(chapters.find((c) => c.topicId === 'topic-2')).toMatchObject({
      startAtPage: 3,
    });
    expect(chapters.find((c) => c.topicId === 'topic-1')).not.toHaveProperty(
      'startAtPage',
    );
  });

  it('refuses a document with no chapters', async () => {
    const { handler } = harness({ topics: [] });
    await expect(handler.handle(request)).rejects.toThrow(/chapters/i);
  });

  it("seeds neither the words before a chapter nor the check after it, for any style; only each chapter's map", async () => {
    const extrasOf = (seeds: LectureSegmentSeed[]) =>
      seeds
        .filter((seed) => seed.kind && seed.kind !== 'page')
        .map((seed) => `${seed.kind}:${seed.pageNumber}@${seed.seq}`);

    const gentle = harness();
    await gentle.handler.handle({ ...request, style: 'gentle' });
    expect(extrasOf(gentle.seeded)).toEqual(['map:1@0', 'map:3@2']);
    expect(gentle.seeded.every((seed) => seed.style === 'gentle')).toBe(true);

    const steady = harness();
    await steady.handler.handle(request);
    expect(extrasOf(steady.seeded)).toEqual(['map:1@0', 'map:3@2']);

    const brisk = harness();
    await brisk.handler.handle({ ...request, style: 'brisk' });
    expect(extrasOf(brisk.seeded)).toEqual(['map:1@0', 'map:3@2']);
  });

  it('prepares ahead of a page: the chapter there first from that page, then the rest by distance, leaving out what exists', async () => {
    // A four-page book is a small book: the whole of it, current chapter first.
    const fresh = harness();
    await fresh.handler.handle({ ...request, aheadOfPage: 3 });
    expect(pagesOf(fresh.seeded).map((s) => s.pageNumber)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      fresh.chapters.map((c) => [c.topicId, c.priority, c.startAtPage]),
    ).toEqual([
      ['topic-1', 2, undefined],
      ['topic-2', 1, 3],
    ]);

    // Chapter two is already there: only chapter one is queued, and first.
    const partly = harness({
      existing: [
        { topicId: 'topic-2', pageNumber: 3, status: 'done' },
        { topicId: 'topic-2', pageNumber: 4, status: 'writing' },
      ],
    });
    await partly.handler.handle({ ...request, aheadOfPage: 3 });
    expect(partly.chapters.map((c) => [c.topicId, c.priority])).toEqual([
      ['topic-1', 1],
    ]);

    // Everything there or coming: nothing is queued and nothing seeded.
    const done = harness({
      existing: [
        { topicId: 'topic-1', pageNumber: 1, status: 'done' },
        { topicId: 'topic-1', pageNumber: 2, status: 'done' },
        { topicId: 'topic-2', pageNumber: 3, status: 'done' },
        { topicId: 'topic-2', pageNumber: 4, status: 'pending' },
      ],
    });
    await done.handler.handle({ ...request, aheadOfPage: 1 });
    expect(done.chapters).toEqual([]);
    expect(done.seeded).toEqual([]);
  });

  it('seeds only the chapters asked for: their pages and their map', async () => {
    const { handler, seeded } = harness();
    await handler.handle({
      ...request,
      topicIds: ['topic-2'],
      style: 'gentle',
    });
    expect(
      seeded.map((seed) => `${seed.kind ?? 'page'}:${seed.pageNumber}`),
    ).toEqual(['page:3', 'page:4', 'map:3']);
  });
});

describe('LectureStatusHandler: boards that need writing again', () => {
  const row = (
    pageNumber: number,
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    topicId: 'topic-1',
    pageNumber,
    seq: pageNumber,
    style: 'steady',
    kind: 'page',
    status: 'done',
    scriptText: 'Some words for the page.',
    audioKey: 'a',
    durationMs: 10_000,
    bridge: false,
    attempts: 1,
    moveOffsets: [0],
    board: null,
    wordTimes: null,
    boardStatus: 'none',
    ...over,
  });

  function harness(
    rows: Record<string, unknown>[],
    position: {
      pageNumber: number;
      offsetMs: number;
      style: string;
    } | null = null,
  ) {
    const queued: {
      pageNumber: number;
      style?: string;
      kind?: string;
      priority?: number;
    }[] = [];
    const aligns: { pageNumber: number; priority?: number }[] = [];
    const handler = new LectureStatusHandler(
      { listByDocument: () => Promise.resolve(TOPICS) } as never,
      {
        listSegments: () => Promise.resolve(rows),
        findPosition: () => Promise.resolve(position),
        listPlans: () => Promise.resolve([]),
      } as never,
      {
        enqueueLectureFollows: () => Promise.resolve(),
        enqueueLectureAligns: (
          jobs: { pageNumber: number; priority?: number }[],
        ) => {
          aligns.push(...jobs);
          return Promise.resolve();
        },
        enqueueLectureBoards: (
          jobs: { pageNumber: number; style?: string; kind?: string }[],
        ) => {
          queued.push(...jobs);
          return Promise.resolve();
        },
      } as never,
      {
        require: () =>
          Promise.resolve({ id: 'doc-1', contentVersion: 2, props: {} }),
      } as never,
      // These are the board's own tests: the hidden board stays on here.
      new ConfigService({ LECTURE_BOARD_ENABLED: 'true' }),
      { find: () => Promise.resolve(null) } as never,
      { find: () => Promise.resolve(null) } as never,
    );
    return { handler, queued, aligns };
  }

  it('queues a board for a finished row with none, and one an older writer wrote', async () => {
    const { handler, queued } = harness([
      row(1),
      row(2, {
        boardStatus: 'done',
        board: { version: 1, generator: 'board-1' },
      }),
      row(3, {
        boardStatus: 'done',
        board: { version: 1, generator: BOARD_GENERATOR_VERSION },
      }),
    ]);
    await handler.handle({ ...request, style: 'steady' });
    expect(queued.map((job) => job.pageNumber)).toEqual([1, 2]);
    expect(queued[0]).toMatchObject({ style: 'steady', kind: 'page' });
  });

  it('queues the page the learner is on first, then outwards', async () => {
    const { handler, queued } = harness([row(1), row(2), row(3), row(4)], {
      pageNumber: 3,
      offsetMs: 0,
      style: 'steady',
    });
    await handler.handle({ ...request, style: 'steady' });
    expect(queued.map((job) => job.pageNumber)).toEqual([3, 2, 4, 1]);
    expect(queued.map((job) => job.priority)).toEqual([1, 2, 3, 4]);
  });

  it('leaves alone rows still being written, failed, skipped, or without words', async () => {
    const { handler, queued } = harness([
      row(1, { boardStatus: 'pending' }),
      row(2, { boardStatus: 'failed' }),
      row(3, { boardStatus: 'skipped' }),
      row(4, { status: 'voicing' }),
      row(5, { scriptText: null }),
    ]);
    await handler.handle({ ...request, style: 'steady' });
    expect(queued).toEqual([]);
  });

  it('has the words of voiced rows measured on their audio, nearest the learner first', async () => {
    const measured = { version: 1, source: 'echogarden-dtw', audioKey: 'a' };
    const { handler, aligns } = harness(
      [
        row(1, { wordTimes: measured }),
        row(2),
        row(3, { wordTimes: { ...measured, audioKey: 'older' } }),
        row(4, { wordTimes: { ...measured, source: 'estimate' } }),
        row(5, { kind: 'check' }),
        row(6, { status: 'voicing' }),
      ],
      { pageNumber: 4, offsetMs: 0, style: 'steady' },
    );
    await handler.handle({ ...request, style: 'steady' });
    expect(aligns.map((job) => job.pageNumber)).toEqual([4, 3, 2]);
    expect(aligns.map((job) => job.priority)).toEqual([1, 2, 3]);
  });
});

describe('SetLectureStyleHandler', () => {
  function harness() {
    const docWrites: { documentId: string; patch: Record<string, unknown> }[] =
      [];
    const profileWrites: Record<string, unknown>[] = [];
    const handler = new SetLectureStyleHandler(
      {
        upsert: (
          _user: string,
          documentId: string,
          patch: Record<string, unknown>,
        ) => {
          docWrites.push({ documentId, patch });
          return Promise.resolve();
        },
      } as never,
      {
        upsert: (_user: string, patch: Record<string, unknown>) => {
          profileWrites.push(patch);
          return Promise.resolve(patch);
        },
      } as never,
      { require: () => Promise.resolve({ id: 'doc-1' }) } as never,
    );
    return { handler, docWrites, profileWrites };
  }

  it("writes the document's style, and the account's only when asked for all", async () => {
    const one = harness();
    await one.handler.handle({ ...request, style: 'brisk', all: false });
    expect(one.docWrites).toEqual([
      { documentId: 'doc-1', patch: { lectureStyle: 'brisk' } },
    ]);
    expect(one.profileWrites).toEqual([]);

    const all = harness();
    await all.handler.handle({ ...request, style: 'gentle', all: true });
    expect(all.docWrites[0].patch).toEqual({ lectureStyle: 'gentle' });
    expect(all.profileWrites).toEqual([{ lectureStyle: 'gentle' }]);
  });

  it('writes the interactive switch on its own, without touching the style', async () => {
    const one = harness();
    await one.handler.handle({ ...request, interactive: true, all: false });
    expect(one.docWrites).toEqual([
      { documentId: 'doc-1', patch: { lectureInteractive: true } },
    ]);
    expect(one.profileWrites).toEqual([]);

    const all = harness();
    await all.handler.handle({ ...request, interactive: false, all: true });
    expect(all.docWrites[0].patch).toEqual({ lectureInteractive: false });
    expect(all.profileWrites).toEqual([{ lectureInteractive: false }]);
  });

  it('refuses an empty change', async () => {
    const one = harness();
    await expect(
      one.handler.handle({ ...request, all: false }),
    ).rejects.toThrow(/Nothing to change/);
  });
});
