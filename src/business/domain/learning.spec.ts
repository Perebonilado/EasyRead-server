import {
  computeCalibration,
  computeMastery,
  effectiveProfile,
  findPromotions,
  openMissedIdeas,
  passScore,
  recommendTutor,
  splitIntoPasses,
  topicReport,
} from './learning';
import type {
  AssessmentEventRecord,
  LearnerProfileRecord,
} from '../repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../repositories/learning.repository';

const at = (minutesAgo: number) =>
  new Date(Date.parse('2026-08-14T12:00:00Z') - minutesAgo * 60_000);

const event = (
  topicId: string,
  score: number,
  minutesAgo: number,
  kind: AssessmentEventRecord['kind'] = 'mcq',
): AssessmentEventRecord => ({
  topicId,
  kind,
  score,
  payload: null,
  createdAt: at(minutesAgo),
});

describe('computeMastery', () => {
  it('withholds judgement until there is enough evidence', () => {
    const [only] = computeMastery([event('t1', 1, 0)], ['t1']);
    expect(only).toMatchObject({ score: null, events: 1, needsRevisit: false });
  });

  it('scores a topic from its own events only', () => {
    const [t1, t2] = computeMastery(
      [
        event('t1', 1, 1),
        event('t1', 1, 2),
        event('t2', 0, 1),
        event('t2', 0, 2),
      ],
      ['t1', 't2'],
    );
    expect(t1.score).toBe(100);
    expect(t2.score).toBe(0);
    expect(t2.needsRevisit).toBe(true);
  });

  it('lets recent recovery outweigh old failure', () => {
    // Three old misses, then three fresh hits.
    const events = [
      event('t1', 1, 1),
      event('t1', 1, 2),
      event('t1', 1, 3),
      event('t1', 0, 100),
      event('t1', 0, 101),
      event('t1', 0, 102),
    ];
    const [mastery] = computeMastery(events, ['t1']);
    expect(mastery.score).toBeGreaterThan(60);
    expect(mastery.needsRevisit).toBe(false);
  });

  it('trusts a tapped MCQ answer more than the tutor’s impression', () => {
    // Same story told twice: one wrong MCQ vs one wrong verbal rating, each
    // against a correct event of the other kind at equal recency.
    const [mcqWrong] = computeMastery(
      [event('t1', 0, 1, 'mcq'), event('t1', 1, 1, 'verbal')],
      ['t1'],
    );
    const [verbalWrong] = computeMastery(
      [event('t1', 1, 1, 'mcq'), event('t1', 0, 1, 'verbal')],
      ['t1'],
    );
    expect(mcqWrong.score!).toBeLessThan(verbalWrong.score!);
  });
});

describe('recommendTutor', () => {
  const profile = (
    over: Partial<LearnerProfileRecord>,
  ): LearnerProfileRecord => ({
    ...DEFAULT_LEARNER_PROFILE,
    ...over,
  });

  it('recommends nothing when nothing is weak', () => {
    expect(recommendTutor(profile({ pace: 'slower' }), 0, 'maya')).toBeNull();
  });

  it('sends a struggling student to the step-by-step tutor', () => {
    expect(recommendTutor(profile({ pace: 'slower' }), 2, 'maya')).toBe('sam');
  });

  it('never recommends the tutor the student already has', () => {
    expect(recommendTutor(profile({ pace: 'slower' }), 2, 'sam')).toBeNull();
  });

  it('reads the style notes', () => {
    expect(
      recommendTutor(
        profile({ styleNotes: 'analogies really landed today' }),
        1,
        'maya',
      ),
    ).toBe('ade');
  });
});

describe('effectiveProfile', () => {
  const base = {
    ...DEFAULT_LEARNER_PROFILE,
    pace: 'steady' as const,
    depth: 'standard' as const,
  };
  const state = (
    paceDelta: 'slower' | 'none' | 'faster',
    depthDelta: 'deeper' | 'none' | 'lighter' = 'none',
  ) => ({ documentId: 'doc-a', paceDelta, depthDelta, reason: null });

  it('returns the profile untouched when nothing is local', () => {
    expect(effectiveProfile(base, null)).toBe(base);
    expect(effectiveProfile(base, state('none'))).toBe(base);
  });

  it('shifts one notch per delta', () => {
    const result = effectiveProfile(base, state('slower', 'deeper'));
    expect(result.pace).toBe('slower');
    expect(result.depth).toBe('deeper');
  });

  it('clamps at the ends of each ladder', () => {
    const slow = { ...base, pace: 'slower' as const };
    expect(effectiveProfile(slow, state('slower')).pace).toBe('slower');
  });

  it('applies to a pinned dial without rewriting the pin', () => {
    // A pin says "my general pace is faster", not "never adapt anywhere".
    const pinned = {
      ...base,
      pace: 'faster' as const,
      paceSource: 'manual' as const,
    };
    const result = effectiveProfile(pinned, state('slower'));
    expect(result.pace).toBe('steady');
    expect(result.paceSource).toBe('manual');
    expect(pinned.pace).toBe('faster');
  });
});

describe('findPromotions', () => {
  const profile = { ...DEFAULT_LEARNER_PROFILE };
  const state = (
    documentId: string,
    paceDelta: 'slower' | 'none' | 'faster',
  ) => ({
    documentId,
    paceDelta,
    depthDelta: 'none' as const,
    reason: null,
  });

  it('one document alone is a subject, not a reader', () => {
    expect(findPromotions(profile, [state('a', 'slower')])).toEqual([]);
  });

  it('promotes when documents agree, and names them', () => {
    const [promotion] = findPromotions(profile, [
      state('a', 'slower'),
      state('b', 'slower'),
    ]);
    expect(promotion.field).toBe('pace');
    expect(promotion.value).toBe('slower');
    expect(promotion.documentIds.sort()).toEqual(['a', 'b']);
    expect(promotion.reason).toContain('2 documents');
    expect(promotion.alreadyGlobal).toBe(false);
  });

  it('disagreeing deltas cancel rather than average', () => {
    expect(
      findPromotions(profile, [state('a', 'slower'), state('b', 'faster')]),
    ).toEqual([]);
  });

  it('flags deltas as redundant when the global is already there', () => {
    // Nothing to promote, but the deltas claim a difference that no longer
    // exists — the caller clears them instead of writing a change.
    const slow = { ...profile, pace: 'slower' as const };
    const [promotion] = findPromotions(slow, [
      state('a', 'slower'),
      state('b', 'slower'),
    ]);
    expect(promotion.alreadyGlobal).toBe(true);
    expect(promotion.documentIds.sort()).toEqual(['a', 'b']);
  });
});

describe('computeCalibration', () => {
  const rated = (score: number, confidence: number): AssessmentEventRecord => ({
    topicId: 't1',
    kind: 'mcq',
    score,
    payload: { confidence },
    createdAt: new Date(),
  });
  const unrated = (score: number): AssessmentEventRecord => ({
    topicId: 't1',
    kind: 'mcq',
    score,
    payload: null,
    createdAt: new Date(),
  });

  it('reports overconfidence as positive bias', () => {
    const result = computeCalibration([rated(0, 1), rated(0, 0.6)]);
    expect(result.n).toBe(2);
    expect(result.bias).toBeCloseTo(0.8, 5);
  });

  it('reports underconfidence as negative bias', () => {
    const result = computeCalibration([rated(1, 0.2), rated(1, 0.6)]);
    expect(result.bias).toBeCloseTo(-0.6, 5);
  });

  it('mixed ratings can cancel to zero', () => {
    const result = computeCalibration([rated(1, 1), rated(0, 0)]);
    expect(result.bias).toBeCloseTo(0, 5);
  });

  it('ignores events without a rating and reports n honestly', () => {
    const result = computeCalibration([rated(0, 1), unrated(1), unrated(1)]);
    expect(result.n).toBe(1);
    expect(result.bias).toBeCloseTo(1, 5);
  });

  it('no rated events means no verdict, not zero', () => {
    expect(computeCalibration([unrated(1)])).toEqual({ bias: null, n: 0 });
  });
});

// ── Passes, pass-aware scoring, missed ideas ────────────────────────────────

describe('passes and the understanding report', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const base = new Date('2026-08-01T09:00:00Z');
  const at = (offsetMs: number) => new Date(base.getTime() + offsetMs);

  const event = (
    offsetMs: number,
    score: number,
    payload: Record<string, unknown> | null = null,
    kind: 'mcq' | 'flashcard' | 'verbal' = 'mcq',
  ): AssessmentEventRecord => ({
    topicId: 't1',
    kind,
    score,
    payload,
    createdAt: at(offsetMs),
  });

  it('groups events into one pass when they sit inside the gap', () => {
    const passes = splitIntoPasses([
      event(0, 1),
      event(2 * HOUR, 0),
      event(5 * HOUR, 1),
    ]);
    expect(passes).toHaveLength(1);
    expect(passes[0].events).toHaveLength(3);
  });

  it('starts a new pass after a gap longer than twelve hours', () => {
    const passes = splitIntoPasses([
      event(0, 0),
      event(HOUR, 0),
      event(2 * DAY, 1),
      event(2 * DAY + HOUR, 1),
    ]);
    expect(passes).toHaveLength(2);
    expect(passes[0].score).toBe(0);
    expect(passes[1].score).toBe(100);
  });

  it('sorts unordered input before splitting', () => {
    const passes = splitIntoPasses([event(2 * DAY, 1), event(0, 0)]);
    expect(passes).toHaveLength(2);
    expect(passes[0].startedAt.getTime()).toBeLessThan(
      passes[1].startedAt.getTime(),
    );
  });

  it('scores a pass only when it holds enough evidence', () => {
    expect(passScore([event(0, 1)])).toBeNull();
    expect(passScore([event(0, 1), event(HOUR, 1)])).toBe(100);
  });

  it('lets a strong reread clear needsRevisit that a weak first pass set', () => {
    const weakThenStrong = topicReport(
      't1',
      [
        event(0, 0),
        event(HOUR, 0),
        event(2 * DAY, 1),
        event(2 * DAY + HOUR, 1),
      ],
      at(2 * DAY + 2 * HOUR),
    );
    expect(weakThenStrong.score).toBe(100);
    expect(weakThenStrong.needsRevisit).toBe(false);
    expect(weakThenStrong.passScores).toEqual([0, 100]);
    expect(weakThenStrong.delta).toBe(100);
    expect(weakThenStrong.passes).toBe(2);
  });

  it('reports the delta as negative when a later pass goes worse', () => {
    const report = topicReport(
      't1',
      [
        event(0, 1),
        event(HOUR, 1),
        event(2 * DAY, 0),
        event(2 * DAY + HOUR, 0),
      ],
      at(2 * DAY + 2 * HOUR),
    );
    expect(report.delta).toBe(-100);
    expect(report.needsRevisit).toBe(true);
  });

  it('labels old evidence stale without touching the score', () => {
    const events = [event(0, 1), event(HOUR, 1)];
    const fresh = topicReport('t1', events, at(2 * DAY));
    const old = topicReport('t1', events, at(30 * DAY));
    expect(fresh.stale).toBe(false);
    expect(old.stale).toBe(true);
    // Time alone must never move the number.
    expect(old.score).toBe(fresh.score);
    expect(old.needsRevisit).toBe(fresh.needsRevisit);
  });

  it('has no score, no staleness and no revisit flag without evidence', () => {
    const empty = topicReport('t1', [], at(0));
    expect(empty.score).toBeNull();
    expect(empty.stale).toBe(false);
    expect(empty.needsRevisit).toBe(false);
    expect(empty.lastEvidenceAt).toBeNull();
  });

  it('folds missed ideas across passes, counting repeats', () => {
    const ideas = openMissedIdeas([
      event(0, 0, { missed: ['The wage-price spiral', 'Aggregate demand'] }),
      event(2 * DAY, 0, { missed: ['The wage-price spiral'] }),
    ]);
    expect(ideas[0]).toMatchObject({
      text: 'The wage-price spiral',
      timesMissed: 2,
      resolvedAt: null,
    });
    expect(ideas[1]).toMatchObject({
      text: 'Aggregate demand',
      timesMissed: 1,
    });
  });

  it('closes an idea a later grade reports as covered', () => {
    const ideas = openMissedIdeas([
      event(0, 0, { missed: ['Aggregate demand'] }),
      event(2 * DAY, 1, { resolved: ['Aggregate demand'] }),
    ]);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].resolvedAt).not.toBeNull();
  });

  it('reopens an idea that goes missing again after being resolved', () => {
    const ideas = openMissedIdeas([
      event(0, 0, { missed: ['Aggregate demand'] }),
      event(2 * DAY, 1, { resolved: ['Aggregate demand'] }),
      event(4 * DAY, 0, { missed: ['Aggregate demand'] }),
    ]);
    expect(ideas[0].resolvedAt).toBeNull();
    expect(ideas[0].timesMissed).toBe(2);
  });

  it('ignores malformed missed and resolved payloads', () => {
    const ideas = openMissedIdeas([
      event(0, 0, { missed: 'not an array' }),
      event(HOUR, 0, { missed: [42, '', '  '] }),
      event(2 * HOUR, 0, { resolved: ['never missed'] }),
    ]);
    expect(ideas).toEqual([]);
  });
});
