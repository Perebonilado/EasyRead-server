import {
  GenerateItemsHandler,
  pageOfQuote,
  shareOut,
  sliceText,
} from './item.handlers';
import type { DraftItem } from '../../domain/items';
import type { GeneratedItem, ItemVerdict } from '../../ports/llm.port';

/**
 * The verification pass is the whole reason this engine can be trusted, so
 * it is tested at the handler: an item the verifier does not confirm must
 * never reach the bank, however well-formed it looks.
 */
const item = (over: Partial<GeneratedItem> = {}): GeneratedItem => ({
  kind: 'mcq',
  stem: 'What drives thermohaline circulation?',
  options: ['Density gradients', 'Solar wind', 'Tidal drag', 'Plate motion'],
  correctIndex: 0,
  explanation: 'Temperature and salinity change water density.',
  hint: null,
  topicTitle: 'Ocean circulation',
  sourceQuote: 'Density differences drive the deep currents.',
  ...over,
});

function build(options: {
  written: GeneratedItem[];
  verdicts: (item: { stem: string; options: string[] }) => ItemVerdict;
}) {
  const created: Record<string, unknown>[] = [];

  // Only the first round returns items: a top-up round finding nothing new
  // is the normal end state, and keeps these tests deterministic.
  let rounds = 0;
  const generateItems = jest.fn(() => {
    rounds += 1;
    return Promise.resolve({
      value: rounds === 1 ? options.written : [],
      usage: { model: 'fake', tokensIn: 0, tokensOut: 0, latencyMs: 1 },
    });
  });

  const llm = {
    generateItems,
    verifyItem: jest.fn((input: { stem: string; options: string[] }) =>
      Promise.resolve({
        value: options.verdicts(input),
        usage: { model: 'fake', tokensIn: 0, tokensOut: 0, latencyMs: 1 },
      }),
    ),
  };

  const items = {
    existingStems: jest.fn(() => Promise.resolve<string[]>([])),
    createMany: jest.fn((rows: Record<string, unknown>[]) => {
      created.push(...rows);
      return Promise.resolve(rows.map((row, i) => ({ ...row, id: `i${i}` })));
    }),
  };

  const topics = {
    listWithReadState: jest.fn(() =>
      Promise.resolve([
        { id: 't1', title: 'Ocean circulation', startPage: 1, endPage: 3 },
      ]),
    ),
  };

  const simplified = {
    findRange: jest.fn(() =>
      Promise.resolve([
        {
          status: 'done',
          blocks: [
            { type: 'paragraph', text: 'Density differences drive it.' },
          ],
        },
      ]),
    ),
  };

  const summaries = { find: jest.fn(() => Promise.resolve(null)) };
  const documentPages = {
    findRange: jest.fn(() =>
      Promise.resolve([
        {
          pageNumber: 1,
          text: 'Original page text about density.',
          isEmpty: false,
        },
      ]),
    ),
  };
  const access = {
    require: jest.fn(() =>
      Promise.resolve({ props: { title: 'Ocean physics' } }),
    ),
  };

  const handler = new GenerateItemsHandler(
    llm as never,
    items as never,
    topics as never,
    simplified as never,
    documentPages as never,
    summaries as never,
    access as never,
  );

  return {
    handler,
    llm,
    generateItems,
    items,
    created,
    simplified,
    documentPages,
  };
}

/**
 * Behaves like the real verifier: reads the options and names the correct
 * one by its text. Anything hardcoding an index would silently break when
 * `siftItems` rotates answers to balance their positions.
 */
const agrees =
  (correctText = 'Density gradients') =>
  (input: { options: string[] }): ItemVerdict => ({
    answerIndex: input.options.indexOf(correctText),
    quote: 'Density differences.',
    supported: true,
  });

const request = {
  userId: 'u1',
  documentId: 'd1',
  topicId: 't1',
  kind: 'mcq' as const,
  count: 2,
};

describe('GenerateItemsHandler', () => {
  it('banks items the verifier independently agrees with', async () => {
    const { handler, created } = build({
      written: [item(), item({ stem: 'A second question?' })],
      verdicts: agrees(),
    });

    const result = await handler.handle(request);

    expect(result.data.created).toBe(2);
    expect(result.data.discarded).toBe(0);
    // The quote is banked, so the reader can be shown where it came from.
    expect(created[0].groundingQuote).toBe('Density differences.');
  });

  it('discards an item whose answer the verifier disagrees with', async () => {
    const { handler, created } = build({
      written: [item(), item({ stem: 'A second question?' })],
      // The verifier reads the passage and lands on a different option:
      // exactly the hallucinated-answer case that must never be shown.
      verdicts: (input) =>
        input.stem.startsWith('A second')
          ? // Lands on a different option than the writer intended: exactly
            // the hallucinated-answer case that must never be shown.
            {
              answerIndex:
                (input.options.indexOf('Density gradients') + 1) %
                input.options.length,
              quote: 'Something else.',
              supported: true,
            }
          : agrees()(input),
    });

    const result = await handler.handle(request);

    expect(result.data.created).toBe(1);
    expect(result.data.discarded).toBe(1);
    expect(created).toHaveLength(1);
  });

  it('discards an item the passage does not settle, even if the answer matches', async () => {
    const { handler } = build({
      written: [item()],
      verdicts: (input) => ({
        ...agrees()(input),
        quote: null,
        supported: false,
      }),
    });

    const result = await handler.handle(request);
    expect(result.data.created).toBe(0);
  });

  it('never banks an item the quality gates reject, and never pays to verify it', async () => {
    const { handler, llm } = build({
      // The correct answer is conspicuously the longest: a give-away.
      written: [
        item({
          options: [
            'Differences in water density caused by temperature and salinity throughout the ocean',
            'Solar wind',
            'Tidal drag',
            'Plate motion',
          ],
        }),
      ],
      verdicts: agrees(),
    });

    const result = await handler.handle(request);

    expect(result.data.created).toBe(0);
    // Gated before the model call: the cheap check runs first.
    expect(llm.verifyItem).not.toHaveBeenCalled();
  });

  it('treats a verifier failure as one lost item, not a failed batch', async () => {
    const { handler } = build({
      written: [item(), item({ stem: 'A second question?' })],
      verdicts: (input) => {
        if (input.stem.startsWith('A second')) throw new Error('model down');
        return agrees()(input);
      },
    });

    const result = await handler.handle(request);
    expect(result.data.created).toBe(1);
  });

  it('judges a flashcard on its quote, since one option cannot disagree', async () => {
    const written = [item({ kind: 'flashcard', options: ['The answer'] })];

    const withQuote = build({
      written,
      verdicts: () => ({
        answerIndex: 0,
        quote: 'Supporting line.',
        supported: true,
      }),
    });
    expect((await withQuote.handler.handle(request)).data.created).toBe(1);

    const without = build({
      written,
      verdicts: () => ({ answerIndex: 0, quote: null, supported: true }),
    });
    expect((await without.handler.handle(request)).data.created).toBe(0);
  });

  it('asks for more than requested across the batch, expecting discards', () => {
    // Deliberately summed across calls, not read off one: a larger test is
    // several small parallel calls, and the overshoot lives in the total.
    const totals = [5, 10, 25].map((count) => {
      const sizes = shareOut(count, Math.ceil(count / 6));
      return {
        count,
        asked: sizes.reduce((sum, size) => sum + Math.ceil(size * 1.7), 0),
      };
    });
    for (const { count, asked } of totals) {
      expect(asked).toBeGreaterThan(count);
    }
  });

  it('tells the writer which questions already exist, so it writes new ones', async () => {
    const { handler, generateItems, items } = build({
      written: [item()],
      verdicts: agrees(),
    });
    items.existingStems.mockResolvedValue(['An existing question?']);

    await handler.handle(request);

    const [asked] = generateItems.mock.calls[0] as unknown as [
      { avoidStems: string[] },
    ];
    expect(asked.avoidStems).toEqual(['An existing question?']);
  });
});

/** Kept honest: the draft shape the handler maps into is the domain's. */
const _shape: DraftItem = {
  kind: 'mcq',
  stem: 's',
  options: ['a', 'b'],
  correctIndex: 0,
  explanation: 'e',
  hint: null,
  topicTitle: null,
};
void _shape;

describe('when the source or the writer misbehaves', () => {
  it('falls back to the original text when a chapter is not simplified', async () => {
    const { handler, simplified, documentPages } = build({
      written: [item()],
      verdicts: agrees(),
    });
    // Nothing simplified at all — the exact state that used to refuse with
    // "hasn't been simplified yet" even on readable documents.
    simplified.findRange.mockResolvedValue([]);

    const result = await handler.handle(request);

    expect(result.data.created).toBe(1);
    expect(documentPages.findRange).toHaveBeenCalled();
  });

  it('reports a writer outage as an outage, never as "not simplified"', async () => {
    const { handler, llm } = build({ written: [], verdicts: agrees() });
    llm.generateItems = jest.fn(() => Promise.reject(new Error('rate limit')));

    await expect(handler.handle(request)).rejects.toThrow(
      /having trouble right now/,
    );
    await expect(handler.handle(request)).rejects.not.toThrow(/simplified/);
  });

  it('never blames the document when the writer merely came back empty', async () => {
    const { handler } = build({ written: [], verdicts: agrees() });

    await expect(handler.handle(request)).rejects.toThrow(
      /came back empty-handed/,
    );
  });

  it('only claims a chapter is importing when there is truly no text', async () => {
    const { handler, simplified, documentPages } = build({
      written: [item()],
      verdicts: agrees(),
    });
    simplified.findRange.mockResolvedValue([]);
    documentPages.findRange.mockResolvedValue([]);

    await expect(handler.handle(request)).rejects.toThrow(/still importing/);
  });
});

describe('shareOut', () => {
  it('divides evenly when it can', () => {
    expect(shareOut(10, 5)).toEqual([2, 2, 2, 2, 2]);
  });

  it('gives the remainder to the earliest chapters', () => {
    expect(shareOut(10, 3)).toEqual([4, 3, 3]);
    expect(shareOut(10, 3).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('never skips a chapter the reader deliberately picked', () => {
    // Six chapters, five questions: every one still gets an item rather
    // than a silent zero.
    expect(shareOut(5, 6)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('handles the single-chapter case', () => {
    expect(shareOut(8, 1)).toEqual([8]);
  });
});

describe('pageOfQuote', () => {
  const pages = [
    { pageNumber: 110, prose: 'IDs must be unique. They must be numeric.' },
    { pageNumber: 115, prose: 'The timestamp section is made up of 41 bits.' },
  ];

  it('finds the page a verbatim quote sits on', () => {
    expect(
      pageOfQuote('The timestamp section is made up of 41 bits.', pages),
    ).toBe(115);
  });

  it('still finds it when the quote was trimmed or re-wrapped', () => {
    expect(
      pageOfQuote(
        '  The timestamp section is made up of 41 bits, plus more',
        pages,
      ),
    ).toBe(115);
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(
      pageOfQuote('A sentence from another book entirely.', pages),
    ).toBeNull();
    expect(pageOfQuote(null, pages)).toBeNull();
    expect(pageOfQuote('   ', pages)).toBeNull();
  });

  it('refuses to match on a fragment too short to be distinctive', () => {
    // "IDs must" would match half a book; a wrong page link is worse than
    // falling back to the chapter.
    expect(pageOfQuote('IDs must', pages)).toBeNull();
  });
});

describe('sliceText', () => {
  const pages = [
    { prose: 'one' },
    { prose: 'two' },
    { prose: 'three' },
    { prose: 'four' },
  ];

  it('gives each batch its own stretch of the chapter', () => {
    const slices = sliceText(pages, 4);
    expect(slices).toEqual(['one', 'two', 'three', 'four']);
  });

  it('groups pages when there are more pages than batches', () => {
    const slices = sliceText(pages, 2);
    expect(slices).toHaveLength(2);
    expect(slices[0]).toContain('one');
    expect(slices[1]).toContain('three');
  });

  it('repeats rather than starving a batch when pages run short', () => {
    // A one-page chapter still has to feed every batch; deduplication
    // downstream removes what they write in common.
    const slices = sliceText([{ prose: 'only' }], 3);
    expect(slices).toEqual(['only', 'only', 'only']);
  });

  it('hands back the whole chapter for a single batch', () => {
    expect(sliceText(pages, 1)).toEqual(['one\n\ntwo\n\nthree\n\nfour']);
  });

  it('survives a chapter with no usable pages', () => {
    expect(sliceText([], 2)).toEqual(['', '']);
  });
});

describe('batch planning', () => {
  it('splits a large request into small calls that still sum to it', () => {
    // The bug this replaces: a hard per-chapter cap turned 25 into 12.
    for (const total of [5, 10, 25, 40]) {
      const sizes = shareOut(total, Math.ceil(total / 6));
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
      for (const size of sizes) expect(size).toBeLessThanOrEqual(6);
    }
  });
});
