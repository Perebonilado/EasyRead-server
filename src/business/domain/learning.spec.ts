import { autoAdjustProfile, computeMastery, recommendTutor } from './learning';
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

describe('autoAdjustProfile', () => {
  const base = DEFAULT_LEARNER_PROFILE;

  it('waits for enough signal', () => {
    expect(autoAdjustProfile([event('t', 0, 1)], base)).toBeNull();
  });

  it('slows down and deepens after a run of misses', () => {
    const misses = [0, 0, 0, 1, 0].map((s, i) => event('t', s, i));
    expect(autoAdjustProfile(misses, base)).toEqual({
      pace: 'slower',
      depth: 'deeper',
    });
  });

  it('does not thrash when already adjusted', () => {
    const misses = [0, 0, 0, 0, 0].map((s, i) => event('t', s, i));
    expect(
      autoAdjustProfile(misses, { ...base, pace: 'slower', depth: 'deeper' }),
    ).toBeNull();
  });

  it('releases the brakes one notch when the student is cruising', () => {
    const wins = [1, 1, 1, 1, 1].map((s, i) => event('t', s, i));
    expect(autoAdjustProfile(wins, { ...base, pace: 'slower' })).toEqual({
      pace: 'steady',
    });
  });
});
