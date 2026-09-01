import { ConfigService } from '@nestjs/config';
import { FakeLlmAdapter } from '../../web/adapters/fake-llm.adapter';
import { LECTURE_GENERATOR_VERSION } from '../../business/domain/lecture';
import type {
  LectureRepository,
  LectureSegmentRecord,
} from '../../business/repositories/lecture.repository';
import { LectureChapterProcessor } from './lecture-chapter.processor';
import { LectureVoiceProcessor } from './lecture-voice.processor';

/**
 * What matters about this pipeline: a chapter is written IN ORDER, so
 * every page after the first knows what was just said (that thread is
 * the whole difference between a lecture and a stack of summaries), a
 * page that cannot be written fails alone, and synthesis happens off the
 * writing path without ever clobbering a script.
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

function fakes(pageText: Record<number, string>, topics = [TOPIC]) {
  const segments = new Map<number, LectureSegmentRecord>();
  const plans = new Map<string, { status: string; plan: unknown }>();
  const voiceJobs: number[] = [];
  const stored: string[] = [];
  const published: { type: string; pageNumber: number }[] = [];
  let synthesised = 0;

  // Seeded the way the generate handler seeds them: every page pending
  // before any model call, with dense document-global order.
  Object.keys(pageText)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((pageNumber, index) => {
      const owner = topics.find(
        (t) => pageNumber >= t.startPage && pageNumber <= t.endPage,
      );
      segments.set(pageNumber, {
        topicId: owner?.id ?? topics[0].id,
        pageNumber,
        seq: index,
        status: 'pending',
        scriptText: null,
        audioKey: null,
        durationMs: null,
        bridge: (pageText[pageNumber] ?? '').length < 120,
        attempts: 0,
      });
    });

  const lectures: LectureRepository = {
    savePlan: (input) => {
      plans.set(input.topicId, { status: input.status, plan: input.plan });
      return Promise.resolve();
    },
    findPlan: (_d, topicId) =>
      Promise.resolve(
        plans.has(topicId)
          ? {
              topicId,
              status: plans.get(topicId)!.status as never,
              plan: plans.get(topicId)!.plan,
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
    seedSegments: () => Promise.resolve(),
    findSegment: (_d, pageNumber) =>
      Promise.resolve(segments.get(pageNumber) ?? null),
    listSegments: () =>
      Promise.resolve([...segments.values()].sort((a, b) => a.seq - b.seq)),
    markSegmentWriting: (_d, pageNumber) => {
      const row = segments.get(pageNumber);
      if (row) row.status = 'writing';
      return Promise.resolve();
    },
    markSegmentWritten: (input) => {
      const row = segments.get(input.pageNumber)!;
      row.status = 'voicing';
      row.scriptText = input.scriptText;
      row.durationMs = input.durationMs;
      return Promise.resolve();
    },
    markSegmentDone: (input) => {
      const row = segments.get(input.pageNumber)!;
      row.status = 'done';
      row.audioKey = input.audioKey;
      row.durationMs = input.durationMs;
      return Promise.resolve();
    },
    markSegmentFailed: (input) => {
      const row = segments.get(input.pageNumber)!;
      row.status = 'failed';
      row.attempts += 1;
      return Promise.resolve();
    },
    resetFailedSegments: () => Promise.resolve(),
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
      enqueueLectureVoices: (jobs: { pageNumber: number }[]) => {
        voiceJobs.push(...jobs.map((job) => job.pageNumber));
        return Promise.resolve();
      },
    },
    events: {
      publish: (_d: string, event: { type: string; pageNumber: number }) => {
        published.push(event);
        return Promise.resolve();
      },
    },
    speech: {
      synthesize: () => {
        synthesised += 1;
        return Promise.resolve({
          audio: Buffer.from('mp3'),
          mimeType: 'audio/mpeg',
          model: 'tts-1',
        });
      },
    },
    storage: {
      size: () => Promise.resolve(null),
      put: (input: { key: string }) => {
        stored.push(input.key);
        return Promise.resolve();
      },
    },
  };

  return {
    lectures,
    deps,
    segments,
    plans,
    voiceJobs,
    stored,
    published,
    synthesised: () => synthesised,
  };
}

const chapterProcessor = (
  f: ReturnType<typeof fakes>,
  llm: FakeLlmAdapter = new FakeLlmAdapter(),
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
  );

const voiceProcessor = (f: ReturnType<typeof fakes>) =>
  new LectureVoiceProcessor(
    f.deps.documents as never,
    f.lectures,
    f.deps.calls,
    f.deps.speech,
    f.deps.storage as never,
    f.deps.events as never,
    new ConfigService({}),
  );

const chapterJob = (topicId = TOPIC.id, orderIndex = 0) => ({
  documentId: doc.id,
  contentVersion: doc.contentVersion,
  topicId,
  orderIndex,
});

const USAGE = { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 };

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

const voiceJob = (pageNumber: number) => ({
  documentId: doc.id,
  contentVersion: doc.contentVersion,
  pageNumber,
});

describe('LectureChapterProcessor', () => {
  it('writes a chapter page by page, in order', async () => {
    const f = fakes({ 1: REAL_PAGE, 2: REAL_PAGE, 3: REAL_PAGE });
    await chapterProcessor(f).process(chapterJob(), CONTEXT);

    expect([...f.segments.values()].map((s) => s.status)).toEqual([
      'voicing',
      'voicing',
      'voicing',
    ]);
    expect(f.voiceJobs).toEqual([1, 2, 3]);
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
    // Page 2 can never be written: all three attempts stray off the page.
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      if (seen >= 2 && seen <= 4) {
        // An invented figure: the one thing that still fails a page.
        return Promise.resolve({
          value: 'UNGROUNDED invention: 4096 widgets in 1913.',
          usage: { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
        });
      }
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(f.segments.get(2)!.status).toBe('failed');
    expect(f.segments.get(3)!.status).toBe('voicing');
    expect(f.voiceJobs).toEqual([1, 3]);
    expect(f.published).toContainEqual({
      type: 'lecture.segment_failed',
      pageNumber: 2,
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
        // An invented figure: the one thing that still fails a page.
        return Promise.resolve({
          value: 'UNGROUNDED invention: 4096 widgets in 1913.',
          usage: { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
        });
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
    const llm = new FakeLlmAdapter();
    const inner = new FakeLlmAdapter();
    const stricts: boolean[] = [];
    let seen = 0;
    llm.lectureSegment = (input) => {
      seen += 1;
      stricts.push(Boolean(input.strict));
      if (seen < 3) {
        return Promise.resolve({ value: 'UNGROUNDED invention', usage: USAGE });
      }
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

    // The first chapter had nothing to differ from; the second is shown
    // the first's actual opening words, which are the planner's hook
    // spoken as written.
    expect(planned[0]).toEqual([]);
    expect(planned[1]).toHaveLength(1);
    expect(planned[1][0]).toMatch(/^Why Inflation matters\. Teach page 1\./);
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
      /^Why Inflation matters\. Teach page 1\./,
    );
    expect(openings).toEqual(['Why Inflation matters.', null]);
    // The hook travels in its own field: the first page has no tail.
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
        return Promise.resolve({
          value: 'Imagine a bank with no vault. Money got scarce.',
          usage: USAGE,
        });
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
      return Promise.resolve({
        value: 'Imagine a bank with no vault. Money got scarce.',
        usage: USAGE,
      });
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    // Three attempts, none of them strict: strict mode is for pages that
    // leave the material, not for a tic.
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
      // Page 1's first attempt: 300 words. Page 2's first attempt: 140,
      // fine for a full page and too long for a light one.
      if (seen === 1)
        return Promise.resolve({ value: long(300), usage: USAGE });
      if (seen === 3)
        return Promise.resolve({ value: long(140), usage: USAGE });
      return inner.lectureSegment(input);
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(corrections[1]).toMatch(/Too long: 30\d words/);
    expect(corrections[3]).toMatch(/Too long: 14\d words/);
    expect([...f.segments.values()].map((s) => s.status)).toEqual([
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
    expect(f.segments.get(1)!.scriptText).toMatch(/^Why Inflation matters\./);
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
    expect(f.segments.get(1)!.scriptText).not.toContain('Imagine');
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
    // Chapter two first, as happens when chapters run alongside each other.
    await processor.process(chapterJob('topic-2', 1), CONTEXT);
    await processor.process(chapterJob('topic-1', 0), CONTEXT);

    expect(taught[0]).toEqual(['Inflation']);
    expect(taught[1]).toEqual([]);

    // Planned again from scratch, chapter two would now see chapter one's
    // actual lines.
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

    // Not the last attempt: the queue gets to retry, and the rows wait.
    await expect(
      chapterProcessor(f, llm).process(chapterJob(), CONTEXT),
    ).rejects.toThrow('model down');
    expect([...f.segments.values()].map((s) => s.status)).toEqual([
      'pending',
      'pending',
    ]);

    await chapterProcessor(f, llm).process(chapterJob(), FINAL);
    expect([...f.segments.values()].map((s) => s.status)).toEqual([
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
      // The hook check passes; every page check objects to the wording.
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

    // Sent back twice with the objection, written strictly the third time,
    // and then kept: the verifier's word alone is no longer a hole.
    expect(stricts).toEqual([false, false, true]);
    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(f.voiceJobs).toEqual([1]);
  });

  it('drops a page whose figures are nowhere in the material, whatever the verifier says', async () => {
    const f = fakes({ 1: REAL_PAGE });
    const llm = new FakeLlmAdapter();
    const corrections: (string | undefined)[] = [];
    llm.lectureSegment = (input) => {
      corrections.push(input.correction);
      return Promise.resolve({
        value: 'The money supply grew 4096 percent after 1913.',
        usage: USAGE,
      });
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
        ? Promise.resolve({
            value: 'Since 2010 prices have risen every year.',
            usage: USAGE,
          })
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
        usage: { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      });
    };

    await chapterProcessor(f, llm).process(chapterJob(), CONTEXT);

    expect(f.segments.get(1)!.status).toBe('voicing');
    expect(verified).toBe(0);
  });
});

describe('LectureVoiceProcessor', () => {
  async function written(pageText: Record<number, string>) {
    const f = fakes(pageText);
    await chapterProcessor(f).process(chapterJob(), CONTEXT);
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
    });
  });

  it('keys the audio by version, voice, model, generator and the words spoken', async () => {
    const f = await written({ 1: REAL_PAGE });
    await voiceProcessor(f).process(voiceJob(1), CONTEXT);

    expect(f.stored[0]).toMatch(
      new RegExp(
        `^documents/doc-1/lecture/v2/1-alloy-gpt-4o-mini-tts-${LECTURE_GENERATOR_VERSION}-[0-9a-f]{10}\\.mp3$`,
      ),
    );
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
    });
  });
});
