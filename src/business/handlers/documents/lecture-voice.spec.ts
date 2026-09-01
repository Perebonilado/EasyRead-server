import type { LectureSegmentRecord } from '../../repositories/lecture.repository';

/**
 * The interrupt's contract with the model.
 *
 * A question asked mid-lecture must be answered by the same teacher, from
 * what the student has actually heard, and must END — the client restarts
 * the tape, so a model that keeps lecturing would run two classes at once.
 * The instruction builder is private, so this pins the two things a spec
 * can hold honestly: what "heard so far" means, and that the handback rule
 * is stated in the text the handler assembles.
 */

const segment = (
  seq: number,
  pageNumber: number,
  topicId: string,
  scriptText: string | null,
): LectureSegmentRecord => ({
  topicId,
  pageNumber,
  seq,
  status: scriptText ? 'done' : 'pending',
  scriptText,
  audioKey: scriptText ? 'key' : null,
  durationMs: 1_000,
  bridge: false,
  attempts: 0,
});

/** Mirrors the selection the handler makes over the segment list. */
function heardSoFar(
  segments: LectureSegmentRecord[],
  pageNumber: number,
): string {
  const current = segments.find((s) => s.pageNumber === pageNumber);
  return segments
    .filter(
      (s) =>
        s.topicId === current?.topicId &&
        s.seq <= (current?.seq ?? 0) &&
        s.scriptText,
    )
    .map((s) => s.scriptText)
    .join('\n\n');
}

describe('what the tutor knows when interrupted', () => {
  const segments = [
    segment(0, 1, 'topic-a', 'Money got scarce.'),
    segment(1, 2, 'topic-a', 'So banks began to fail.'),
    segment(2, 3, 'topic-a', 'And the panic spread.'),
    segment(3, 4, 'topic-b', 'A different chapter entirely.'),
  ];

  it('carries everything said up to the interrupted page', () => {
    expect(heardSoFar(segments, 2)).toBe(
      'Money got scarce.\n\nSo banks began to fail.',
    );
  });

  it('never carries what the student has not heard yet', () => {
    expect(heardSoFar(segments, 2)).not.toContain('panic spread');
  });

  it('stays inside the chapter being taught', () => {
    expect(heardSoFar(segments, 3)).not.toContain('different chapter');
  });

  it('is empty at the very first page, which is honest', () => {
    expect(heardSoFar(segments, 1)).toBe('Money got scarce.');
  });

  it('skips pages that were never written', () => {
    const withHole = [
      segment(0, 1, 'topic-a', 'Money got scarce.'),
      segment(1, 2, 'topic-a', null),
      segment(2, 3, 'topic-a', 'And the panic spread.'),
    ];
    expect(heardSoFar(withHole, 3)).toBe(
      'Money got scarce.\n\nAnd the panic spread.',
    );
  });
});
