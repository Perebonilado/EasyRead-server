import { TopicsProcessor } from './topics.processor';
import type { TopicDraft } from '../../business/ports/llm.port';

/**
 * `clamp` is the guard between what the model returns and what the topic
 * navigator renders, so it's tested directly rather than through the processor's
 * dependencies.
 */
const clamp = (drafts: TopicDraft[], pageCount: number) =>
  (
    TopicsProcessor.prototype as unknown as {
      clamp(
        drafts: TopicDraft[],
        pageCount: number,
      ): {
        title: string;
        startPage: number;
        endPage: number;
      }[];
    }
  ).clamp(drafts, pageCount);

const draft = (
  title: string,
  startPage: number,
  endPage: number,
): TopicDraft => ({
  title,
  shortDescription: null,
  startPage,
  endPage,
});

describe('TopicsProcessor.clamp', () => {
  it('covers every page, closing the gaps the model leaves', () => {
    // Straight from a real run: the model skipped 11, 14-15 and 26.
    const topics = clamp(
      [
        draft('ADH', 6, 10),
        draft('Oxytocin', 12, 13),
        draft('Thyroid', 16, 25),
        draft('Effects', 27, 28),
      ],
      50,
    );

    const covered = new Set<number>();
    for (const topic of topics) {
      for (let page = topic.startPage; page <= topic.endPage; page++)
        covered.add(page);
    }

    for (let page = 1; page <= 50; page++) {
      expect(covered.has(page)).toBe(true);
    }
  });

  it('starts at page one and ends at the last page', () => {
    const topics = clamp([draft('Middle', 10, 20)], 50);
    expect(topics[0].startPage).toBe(1);
    expect(topics[0].endPage).toBe(50);
  });

  it('reorders topics the model emitted out of sequence', () => {
    const topics = clamp([draft('Second', 20, 30), draft('First', 1, 19)], 30);
    expect(topics.map((topic) => topic.title)).toEqual(['First', 'Second']);
  });

  it('pulls ranges past the end of the document back inside it', () => {
    const topics = clamp(
      [draft('Real', 1, 10), draft('Hallucinated', 400, 500)],
      20,
    );
    for (const topic of topics) {
      expect(topic.endPage).toBeLessThanOrEqual(20);
      expect(topic.startPage).toBeLessThanOrEqual(20);
    }
  });

  it('resolves overlaps in favour of the later topic', () => {
    const topics = clamp([draft('A', 1, 30), draft('B', 10, 20)], 30);
    expect(topics[0]).toMatchObject({ title: 'A', startPage: 1, endPage: 9 });
    expect(topics[1]).toMatchObject({ title: 'B', startPage: 10, endPage: 30 });
  });

  it('drops a duplicate topic claiming the same start page', () => {
    const topics = clamp([draft('A', 5, 5), draft('B', 5, 10)], 10);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ title: 'A', startPage: 1, endPage: 10 });
  });

  it('never produces overlapping ranges', () => {
    const topics = clamp(
      [
        draft('A', 1, 30),
        draft('B', 10, 40),
        draft('C', 10, 12),
        draft('D', 25, 25),
      ],
      50,
    );

    for (let index = 1; index < topics.length; index++) {
      expect(topics[index].startPage).toBeGreaterThan(
        topics[index - 1].endPage,
      );
    }
  });

  it('drops untitled topics', () => {
    expect(clamp([draft('   ', 1, 5)], 5)).toHaveLength(0);
  });

  it('returns nothing for no drafts', () => {
    expect(clamp([], 50)).toEqual([]);
  });
});

/**
 * A document's own chapters come first: its bookmarks, then its headings,
 * and only then the model's reading of a digest. A Studio document is
 * read for no prerequisites, and is ready once its chapters are.
 */
describe('TopicsProcessor, its own chapters first', () => {
  const build = (options: {
    origin?: 'reader' | 'studio';
    bookmarks?: { title: string; page: number | null; depth: number }[];
    headings?: {
      page: number;
      body: number;
      lines: { text: string; size: number }[];
    }[];
  }) => {
    const saved: {
      topics: { title: string; startPage: number }[];
      source: string;
    }[] = [];
    const asked: string[] = [];
    const ready: string[] = [];
    const doc = {
      id: 'd1',
      contentVersion: 1,
      props: {
        pageCount: 30,
        canonicalPdfRef: 'documents/d1/canonical.pdf',
        origin: options.origin ?? 'reader',
        source: 'uploaded',
        importManifest: null,
        deletedAt: null,
      },
    };
    const processor = new TopicsProcessor(
      { findById: () => Promise.resolve(doc) } as never,
      {
        claim: () => Promise.resolve(true),
        complete: () => Promise.resolve(),
        skip: () => Promise.resolve(),
      } as never,
      {
        findRange: () =>
          Promise.resolve([
            {
              pageNumber: 1,
              text: 'Some text about cells.',
              charCount: 22,
              isEmpty: false,
            },
          ]),
      } as never,
      {
        replaceAll: (
          _id: string,
          topics: { title: string; startPage: number }[],
          source: string,
        ) => {
          saved.push({ topics, source });
          return Promise.resolve();
        },
      } as never,
      { find: () => Promise.resolve('A book about cells.') } as never,
      { record: () => Promise.resolve() },
      {
        outlineTopics: () => {
          asked.push('outline');
          return Promise.resolve({
            value: [
              draft('Read by the model', 1, 15),
              draft('And more', 16, 30),
            ],
            usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
          });
        },
        outlinePrerequisites: () => {
          asked.push('prerequisites');
          return Promise.resolve({
            value: [],
            usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
          });
        },
      } as never,
      { publish: () => Promise.resolve() } as never,
      {
        markReadyIfComplete: (id: string) => {
          ready.push(id);
          return Promise.resolve();
        },
      } as never,
      {
        bookmarks: () => Promise.resolve(options.bookmarks ?? []),
        headings: () => Promise.resolve(options.headings ?? []),
      } as never,
      { get: () => Promise.resolve(Buffer.from('%PDF')) } as never,
    );
    const job = { documentId: 'd1', contentVersion: 1 };
    const context = { attemptsMade: 1, isFinalAttempt: true, jobId: 'j' };
    return {
      processor,
      saved,
      asked,
      ready,
      run: () => processor.process(job, context),
    };
  };

  it('takes the bookmarks, and asks the model nothing but prerequisites', async () => {
    const t = build({
      bookmarks: [
        { title: 'Cells', page: 1, depth: 0 },
        { title: 'Membranes', page: 11, depth: 0 },
        { title: 'Osmosis', page: 21, depth: 0 },
      ],
    });
    await t.run();
    expect(t.saved).toEqual([
      {
        source: 'bookmarks',
        topics: [
          expect.objectContaining({
            title: 'Cells',
            startPage: 1,
            endPage: 10,
          }),
          expect.objectContaining({
            title: 'Membranes',
            startPage: 11,
            endPage: 20,
          }),
          expect.objectContaining({
            title: 'Osmosis',
            startPage: 21,
            endPage: 30,
          }),
        ],
      },
    ]);
    expect(t.asked).toEqual(['prerequisites']);
    expect(t.ready).toEqual(['d1']);
  });

  it('takes the headings when there are no bookmarks', async () => {
    const t = build({
      headings: [
        { page: 2, body: 11, lines: [{ text: 'Chapter 1: Cells', size: 22 }] },
        {
          page: 16,
          body: 11,
          lines: [{ text: 'Chapter 2: Membranes', size: 22 }],
        },
      ],
    });
    await t.run();
    expect(t.saved[0].source).toBe('headings');
    expect(t.saved[0].topics.map((c) => c.title)).toEqual([
      'Chapter 1: Cells',
      'Chapter 2: Membranes',
    ]);
    expect(t.asked).not.toContain('outline');
  });

  it("falls back on the model's reading when the document says nothing of its chapters", async () => {
    const t = build({ bookmarks: [{ title: 'Only', page: 1, depth: 0 }] });
    await t.run();
    expect(t.asked).toEqual(['outline', 'prerequisites']);
    expect(t.saved[0].source).toBe('outline_pass');
  });

  it('reads no prerequisites for a Studio document', async () => {
    const t = build({
      origin: 'studio',
      bookmarks: [
        { title: 'Cells', page: 1, depth: 0 },
        { title: 'Membranes', page: 11, depth: 0 },
      ],
    });
    await t.run();
    expect(t.asked).toEqual([]);
    expect(t.saved[0].source).toBe('bookmarks');
    const model = build({ origin: 'studio' });
    await model.run();
    expect(model.asked).toEqual(['outline']);
  });
});
