import {
  evaluate,
  fixtureSpoken,
  loadFixtures,
  meanScore,
  noWorseThan,
  resolveLabel,
  scoreAssignments,
  type FollowScore,
} from './follow-eval';
import { alignSentences, noteUnits } from './follow';

/**
 * The matcher against the labelled pages. Each fixture records the score
 * the matcher had when it was last accepted; a change that drops any of
 * the three numbers on any page fails here, and a change that raises them
 * is recorded by `npm run follow:eval -- --write-baseline`.
 */
const fixtures = loadFixtures();

describe('follow-along accuracy: the labelled pages', () => {
  it('has the pages the plan asked for', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    const styles = new Set(fixtures.map((fixture) => fixture.style));
    expect(styles.has('gentle')).toBe(true);
    expect(styles.has('brisk')).toBe(true);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s: every label names a sentence the note has, and no spoken sentence runs backwards',
    (_name, fixture) => {
      const units = noteUnits(fixture.blocks);
      expect(fixture.labels).toHaveLength(fixture.wordTimes.sentences.length);
      for (const label of fixture.labels) {
        expect(() => resolveLabel(label, units)).not.toThrow();
      }
      // The aligner can leave a last sentence with no measured length; the
      // matcher keeps it in place so labels and sentences stay in step.
      for (const [, , startMs, endMs] of fixture.wordTimes.sentences) {
        expect(endMs).toBeGreaterThanOrEqual(startMs);
      }
    },
  );

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s: the matcher is no worse than when it was last accepted',
    (_name, fixture) => {
      const { score } = evaluate(fixture);
      if (!fixture.baseline) return;
      expect({
        ...score,
        ok: noWorseThan(score, fixture.baseline),
      }).toMatchObject({
        ok: true,
      });
    },
  );

  it('the set as a whole is no worse than when it was last accepted', () => {
    const recorded = fixtures.filter((fixture) => fixture.baseline);
    if (!recorded.length) return;
    const now = meanScore(recorded.map((fixture) => evaluate(fixture).score));
    const then = meanScore(
      recorded.map(
        (fixture) => fixture.baseline as NonNullable<typeof fixture.baseline>,
      ),
    );
    expect(noWorseThan(now, then)).toBe(true);
  });
});

describe('follow-along accuracy: what the author tags are worth', () => {
  // No page has been written with tags yet, so the tags are simulated from
  // the labels: the sentence the label wants is what a right-minded writer
  // would have named. This proves the mechanics, not the writer.
  it('tags from the labels lift every page to the labels, or nearly', () => {
    const scores: FollowScore[] = [];
    for (const fixture of fixtures) {
      const units = noteUnits(fixture.blocks);
      const wants = fixture.labels.map((label) => resolveLabel(label, units));
      const tagged = wants.map((want) => {
        if (!want) return null;
        const set = new Set<number>();
        units.forEach((unit, index) => {
          if (unit.block !== want.block) return;
          if (want.sentence !== null && unit.sentence !== want.sentence) return;
          set.add(index);
        });
        return set;
      });
      const { said } = fixtureSpoken(fixture);
      const assigned = alignSentences(said, units, { tagged });
      const score = scoreAssignments(wants, assigned, units);
      scores.push(score);
      // A tag whose sentence shares no word with what was said is treated
      // as a mistake, and one page opens on a later block before going
      // back to the first, a step the walk cannot take yet. So near, not at.
      expect(score.block).toBeGreaterThanOrEqual(0.6);
    }
    const mean = meanScore(scores);
    expect(mean.sentence).toBeGreaterThanOrEqual(0.9);
    expect(mean.block).toBeGreaterThanOrEqual(0.9);
  });
});
