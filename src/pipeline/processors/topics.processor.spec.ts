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
