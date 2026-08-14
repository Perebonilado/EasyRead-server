import {
  assessStruggle,
  SIGNAL_WEIGHT,
  STRUGGLE_THRESHOLD,
  type StruggleKind,
  type StruggleSignalRecord,
} from './struggle';

const at = (minutesAgo: number) =>
  new Date(Date.parse('2026-08-14T12:00:00Z') - minutesAgo * 60_000);

const signal = (kind: StruggleKind, minutesAgo = 0): StruggleSignalRecord => ({
  kind,
  weight: SIGNAL_WEIGHT[kind],
  topicId: null,
  pageNumber: null,
  createdAt: at(minutesAgo),
});

describe('assessStruggle', () => {
  it('a flood from ONE kind never reads as struggling', () => {
    // Ten chat questions clear the score threshold three times over — but an
    // engaged reader asks questions. One channel cannot move the dials.
    const flood = Array.from({ length: 10 }, () => signal('chat_question'));
    const result = assessStruggle(flood);
    expect(result.score).toBeGreaterThan(STRUGGLE_THRESHOLD);
    expect(result.struggling).toBe(false);
  });

  it('two kinds agreeing does read as struggling', () => {
    const result = assessStruggle([
      signal('quiz_wrong'),
      signal('quiz_wrong'),
      signal('prereq_requested'),
    ]);
    expect(result.struggling).toBe(true);
    expect(result.positiveKinds.sort()).toEqual([
      'prereq_requested',
      'quiz_wrong',
    ]);
  });

  it('correct answers pull the score back down', () => {
    const result = assessStruggle([
      signal('quiz_wrong'),
      signal('quiz_wrong'),
      signal('prereq_requested'),
      signal('quiz_right'),
      signal('quiz_right'),
    ]);
    // 0.8 + 0.8 + 0.9 − 0.6 − 0.6 = 1.3 < threshold: recovered.
    expect(result.struggling).toBe(false);
  });

  it('cruising means right answers and nothing else', () => {
    expect(
      assessStruggle([signal('quiz_right'), signal('quiz_right')]).cruising,
    ).toBe(true);
    // One question in the window is enough to withhold the judgement.
    expect(
      assessStruggle([signal('quiz_right'), signal('chat_question')]).cruising,
    ).toBe(false);
  });

  it('an empty window judges nothing', () => {
    const result = assessStruggle([]);
    expect(result.struggling).toBe(false);
    expect(result.cruising).toBe(false);
    expect(result.score).toBe(0);
  });

  it('the score never goes negative', () => {
    expect(
      assessStruggle([signal('quiz_right'), signal('quiz_right')]).score,
    ).toBe(0);
  });
});
