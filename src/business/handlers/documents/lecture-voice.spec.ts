import type { LectureSegmentRecord } from '../../repositories/lecture.repository';
import { KIND_RANK } from '../../domain/lecture';

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
  style: 'steady',
  kind: 'page',
  status: scriptText ? 'done' : 'pending',
  scriptText,
  audioKey: scriptText ? 'key' : null,
  durationMs: 1_000,
  bridge: false,
  attempts: 0,
  moveOffsets: null,
});

/** Mirrors the selection the handler makes over the segment list. */
function heardSoFar(
  segments: LectureSegmentRecord[],
  pageNumber: number,
  kind: 'page' | 'part' = 'page',
): string {
  const current = segments.find(
    (s) => s.pageNumber === pageNumber && s.kind === kind,
  );
  return segments
    .filter(
      (s) =>
        (s.kind === 'page' || s.kind === 'part') &&
        s.topicId === current?.topicId &&
        (s.seq < (current?.seq ?? 0) ||
          (s.seq === (current?.seq ?? 0) &&
            KIND_RANK[s.kind] <= KIND_RANK[current?.kind ?? 'page'])) &&
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

  it('counts the second piece of a cut page only once the student is in it', () => {
    const cut = [
      segment(0, 1, 'topic-a', 'Money got scarce.'),
      {
        ...segment(0, 1, 'topic-a', 'And credit dried up.'),
        kind: 'part' as const,
      },
      { ...segment(0, 1, 'topic-a', 'A check.'), kind: 'check' as const },
      segment(1, 2, 'topic-a', 'So banks began to fail.'),
    ];
    expect(heardSoFar(cut, 1)).toBe('Money got scarce.');
    expect(heardSoFar(cut, 1, 'part')).toBe(
      'Money got scarce.\n\nAnd credit dried up.',
    );
    expect(heardSoFar(cut, 2)).toBe(
      'Money got scarce.\n\nAnd credit dried up.\n\nSo banks began to fail.',
    );
    expect(heardSoFar(cut, 2)).not.toContain('A check.');
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
