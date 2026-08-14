import { expectedMs, judgeVisit, MAX_VISIT_MS, MIN_VISIT_MS } from './dwell';

describe('expectedMs', () => {
  it('scales with page length', () => {
    // 400 words at 200 wpm = two minutes.
    expect(expectedMs(400)).toBe(120_000);
  });

  it('floors short pages, so a chapter title is not "slow"', () => {
    expect(expectedMs(5)).toBe(10_000);
  });
});

describe('judgeVisit', () => {
  it('discards a glance', () => {
    expect(judgeVisit({ page: 4, words: 300, ms: MIN_VISIT_MS - 1 }, 4)).toBe(
      null,
    );
  });

  it('flags a page that took far longer than it should', () => {
    // 200 words ≈ 60s expected; six minutes is well past 3×.
    const verdict = judgeVisit({ page: 12, words: 200, ms: 360_000 }, 12);
    expect(verdict?.kind).toBe('long_dwell');
    // Capped: the residue after attention-gating still can't mean an hour.
    expect(verdict?.ms).toBe(MAX_VISIT_MS);
  });

  it('does not flag a long page read at a normal speed', () => {
    // 1200 words ≈ 6 min expected; seven minutes is ordinary reading.
    expect(judgeVisit({ page: 12, words: 1200, ms: 420_000 }, 12)).toBe(null);
  });

  it('reads a deliberate return to earlier material as a reread', () => {
    const verdict = judgeVisit({ page: 4, words: 900, ms: 40_000 }, 20);
    expect(verdict?.kind).toBe('reread');
  });

  it('a glance back at the previous page is not a reread', () => {
    // One page back, not three: this is normal back-and-forth.
    expect(judgeVisit({ page: 19, words: 900, ms: 40_000 }, 20)).toBe(null);
  });

  it('a brief look at an earlier page is not a reread either', () => {
    expect(judgeVisit({ page: 4, words: 900, ms: 8_000 }, 20)).toBe(null);
  });
});
