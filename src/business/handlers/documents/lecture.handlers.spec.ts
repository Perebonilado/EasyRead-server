import { GenerateLectureHandler } from './lecture.handlers';
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
}

interface HarnessOptions {
  topics?: typeof TOPICS;
  /** null models a document whose pages are not extracted yet. */
  pageCount?: number | null;
  pages?: number[];
  /** Rows a previous request already left behind. */
  existing?: ExistingRow[];
}

function harness({
  topics = TOPICS,
  pageCount = 4,
  pages = [1, 2, 3, 4],
  existing = [],
}: HarnessOptions = {}) {
  const seeded: LectureSegmentSeed[] = [];
  const chapters: { topicId: string; orderIndex: number }[] = [];
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
      clear: () => {
        events.push('clear');
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
        jobs: { topicId: string; orderIndex: number }[],
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
    expect(seeded.map((s) => s.pageNumber)).toEqual([1, 2, 3, 4]);
  });

  it('numbers play order across the whole document, not per chapter', async () => {
    const { handler, seeded } = harness();
    await handler.handle(request);
    const seqs = seeded.map((s) => s.seq);
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
      },
      {
        documentId: 'doc-1',
        contentVersion: 2,
        topicId: 'topic-2',
        orderIndex: 1,
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

    expect(seeded.map((s) => s.pageNumber)).toEqual([3, 4]);
    expect(chapters.map((c) => c.topicId)).toEqual(['topic-2']);
  });

  it('keeps play order document-global when only part is written', async () => {
    // THE thing that must not break. Numbering the selection on its own
    // would give chapter two's first page seq 0, and a chapter added
    // later would collide with it and shuffle the lecture.
    const { handler, seeded } = harness();
    await handler.handle({ ...request, topicIds: ['topic-2'] });

    expect(seeded.map((s) => s.seq)).toEqual([2, 3]);
  });

  it('lets a second request add chapters without renumbering the first', async () => {
    const { handler, seeded } = harness();
    await handler.handle({ ...request, topicIds: ['topic-2'] });
    const first = seeded.map((s) => ({ page: s.pageNumber, seq: s.seq }));
    seeded.length = 0;

    await handler.handle({ ...request, topicIds: ['topic-1'] });
    const second = seeded.map((s) => ({ page: s.pageNumber, seq: s.seq }));

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
    expect(seeded).toHaveLength(4);
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

    expect(events).toEqual(['clear', 'seed']);
    expect(seeded.map((s) => s.pageNumber)).toEqual([1, 2, 3, 4]);
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

  it('refuses a document with no chapters', async () => {
    const { handler } = harness({ topics: [] });
    await expect(handler.handle(request)).rejects.toThrow(/chapters/i);
  });
});
