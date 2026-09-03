import { FakeLlmAdapter } from '../../../web/adapters/fake-llm.adapter';
import type {
  LectureRepository,
  LectureSegmentRecord,
  LectureSegmentSeed,
} from '../../repositories/lecture.repository';
import type { LecturePlan } from '../../domain/lecture';
import { LectureReviewHandler, REVIEW_AFTER_MS } from './lecture.handlers';

/**
 * The "last time" review: written on demand for a learner coming back
 * after a day, from the plan of what they heard, and placed before the
 * page they resume at.
 */

const doc = { id: 'doc-1', contentVersion: 1, props: { title: 'Money' } };
const request = { userId: 'user-1', documentId: 'doc-1' };

const page = (
  seq: number,
  pageNumber: number,
  topicId: string,
): LectureSegmentRecord => ({
  topicId,
  pageNumber,
  seq,
  style: 'steady',
  kind: 'page',
  status: 'done',
  scriptText: `Page ${pageNumber}.`,
  audioKey: 'key',
  durationMs: 1_000,
  bridge: false,
  attempts: 0,
  moveOffsets: [],
});

const plan = (title: string, pages: number[]): LecturePlan => ({
  hook: `Why ${title} matters.`,
  arc: `The shape of ${title}.`,
  payoff: `You can explain ${title}.`,
  beats: pages.map((pageNumber) => ({
    pageNumber,
    goal: `Teach page ${pageNumber}.`,
    newHere: `${title}: the idea on page ${pageNumber}`,
  })),
});

function harness(options: {
  position?: {
    pageNumber: number;
    style?: 'gentle' | 'steady' | 'brisk';
    agoMs: number;
  } | null;
}) {
  const rows: LectureSegmentRecord[] = [
    page(0, 1, 'topic-1'),
    page(1, 2, 'topic-1'),
    page(2, 3, 'topic-2'),
    page(3, 4, 'topic-2'),
    // A review from an earlier return, sitting on page 2.
    { ...page(1, 2, 'topic-1'), kind: 'review', scriptText: 'Old review.' },
  ];
  const plans = new Map<string, LecturePlan>([
    ['topic-1', plan('Inflation', [1, 2])],
    ['topic-2', plan('Deflation', [3, 4])],
  ]);
  const events: string[] = [];
  const seeded: LectureSegmentSeed[] = [];
  const written: { pageNumber: number; kind?: string; scriptText: string }[] =
    [];
  const voiced: { pageNumber: number; kind?: string }[] = [];
  const asked: { kind: string; taught: string[]; daysAway: number | null }[] =
    [];
  const position = options.position
    ? {
        pageNumber: options.position.pageNumber,
        offsetMs: 500,
        style: options.position.style ?? ('steady' as const),
        updatedAt: new Date(Date.now() - options.position.agoMs).toISOString(),
      }
    : null;

  const lectures = {
    findPosition: () => Promise.resolve(position),
    listSegments: () => Promise.resolve(rows),
    findPlan: (_d: string, topicId: string) =>
      Promise.resolve(
        plans.has(topicId)
          ? { topicId, status: 'done' as const, plan: plans.get(topicId) }
          : null,
      ),
    removeSegments: (_d: string, _v: number, style: string, kind: string) => {
      events.push(`remove:${style}:${kind}`);
      return Promise.resolve();
    },
    seedSegments: (input: { segments: LectureSegmentSeed[] }) => {
      seeded.push(...input.segments);
      events.push('seed');
      return Promise.resolve();
    },
    markSegmentWriting: () => {
      events.push('writing');
      return Promise.resolve();
    },
    markSegmentWritten: (input: {
      pageNumber: number;
      kind?: string;
      scriptText: string;
    }) => {
      written.push(input);
      events.push('written');
      return Promise.resolve();
    },
    markSegmentFailed: () => {
      events.push('failed');
      return Promise.resolve();
    },
  } as unknown as LectureRepository;

  const llm = new FakeLlmAdapter();
  const inner = new FakeLlmAdapter();
  llm.lectureExtra = (input) => {
    asked.push({
      kind: input.kind,
      taught: input.taught,
      daysAway: input.daysAway,
    });
    return inner.lectureExtra(input);
  };

  const handler = new LectureReviewHandler(
    lectures,
    llm,
    { record: () => Promise.resolve() },
    {
      enqueueLectureVoices: (jobs: { pageNumber: number; kind?: string }[]) => {
        voiced.push(...jobs);
        return Promise.resolve();
      },
    } as never,
    { require: () => Promise.resolve(doc) } as never,
    {
      handle: (cmd: { style: string }) =>
        Promise.resolve({ data: { style: cmd.style, generated: true } }),
    } as never,
  );
  return { handler, events, seeded, written, voiced, asked };
}

describe('LectureReviewHandler', () => {
  it('writes the review of the chapter so far before the page the learner resumes at', async () => {
    const f = harness({
      position: { pageNumber: 2, agoMs: 2 * REVIEW_AFTER_MS },
    });
    const { data } = await f.handler.handle(request);

    expect(f.events).toEqual([
      'remove:steady:review',
      'seed',
      'writing',
      'written',
    ]);
    expect(f.seeded).toEqual([
      {
        topicId: 'topic-1',
        pageNumber: 2,
        seq: 1,
        bridge: false,
        style: 'steady',
        kind: 'review',
      },
    ]);
    // Only what they heard: page 1's idea, not page 2's.
    expect(f.asked).toEqual([
      {
        kind: 'review',
        taught: ['Inflation: the idea on page 1'],
        daysAway: 2,
      },
    ]);
    expect(f.written[0]).toMatchObject({ pageNumber: 2, kind: 'review' });
    expect(f.written[0].scriptText).toContain('[pause]');
    expect(f.voiced).toEqual([
      {
        documentId: 'doc-1',
        contentVersion: 1,
        pageNumber: 2,
        style: 'steady',
        kind: 'review',
      },
    ]);
    expect(data).toMatchObject({ style: 'steady' });
  });

  it("reviews the previous chapter when the learner stopped at a chapter's first page", async () => {
    const f = harness({
      position: { pageNumber: 3, agoMs: 30 * REVIEW_AFTER_MS },
    });
    await f.handler.handle(request);
    expect(f.asked[0].taught).toEqual([
      'Inflation: the idea on page 1',
      'Inflation: the idea on page 2',
    ]);
    expect(f.asked[0].daysAway).toBe(30);
    expect(f.seeded[0]).toMatchObject({
      pageNumber: 3,
      seq: 2,
      kind: 'review',
    });
  });

  it('writes nothing for a learner away less than a day', async () => {
    const f = harness({
      position: { pageNumber: 2, agoMs: 2 * 60 * 60 * 1000 },
    });
    await f.handler.handle(request);
    expect(f.events).toEqual([]);
    expect(f.asked).toEqual([]);
  });

  it('writes nothing for a quick learner, and nothing without a position', async () => {
    const brisk = harness({
      position: { pageNumber: 2, style: 'brisk', agoMs: 3 * REVIEW_AFTER_MS },
    });
    await brisk.handler.handle(request);
    expect(brisk.events).toEqual([]);

    const fresh = harness({ position: null });
    await fresh.handler.handle(request);
    expect(fresh.events).toEqual([]);
  });

  it('writes nothing when the learner is at the very start', async () => {
    const f = harness({
      position: { pageNumber: 1, agoMs: 3 * REVIEW_AFTER_MS },
    });
    await f.handler.handle(request);
    expect(f.events).toEqual([]);
  });

  it('marks the row failed when the writer fails, and still answers', async () => {
    const f = harness({
      position: { pageNumber: 2, agoMs: 2 * REVIEW_AFTER_MS },
    });
    const broken = new FakeLlmAdapter();
    broken.lectureExtra = () => Promise.reject(new Error('writer down'));
    const handler = new LectureReviewHandler(
      (f as unknown as { handler: { lectures: LectureRepository } }).handler
        .lectures,
      broken,
      { record: () => Promise.resolve() },
      { enqueueLectureVoices: () => Promise.resolve() } as never,
      { require: () => Promise.resolve(doc) } as never,
      {
        handle: () => Promise.resolve({ data: { style: 'steady' } }),
      } as never,
    );
    const { data } = await handler.handle(request);
    expect(f.events.at(-1)).toBe('failed');
    expect(data).toMatchObject({ style: 'steady' });
  });
});
