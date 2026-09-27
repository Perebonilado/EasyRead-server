import {
  PASS_MARK,
  cleanVerdict,
  judgedPoints,
  verdictPasses,
  verdictScore,
  type DrawingVerdict,
} from './drawing-score';

const verdict = (patch: Partial<DrawingVerdict> = {}): DrawingVerdict => ({
  sees: 'a horse',
  recognisable: 9,
  anatomy: 8,
  face: 7,
  change: null,
  same: null,
  place: null,
  problems: [],
  ...patch,
});

describe('the scorecard, as the judge scores it', () => {
  it('counts only the points that apply', () => {
    expect(judgedPoints(verdict()).map((one) => one.name)).toEqual([
      'recognisable',
      'anatomy',
      'face',
    ]);
    expect(
      judgedPoints(verdict({ face: null, place: 6 })).map((one) => one.name),
    ).toEqual(['recognisable', 'anatomy', 'place']);
  });

  it('scores a verdict as the mean of its points, and nothing as 0', () => {
    expect(verdictScore(verdict())).toBe(8);
    expect(verdictScore(null)).toBe(0);
  });

  it('passes only when every point reaches the mark', () => {
    expect(PASS_MARK).toBe(8);
    expect(verdictPasses(verdict())).toBe(false);
    expect(verdictPasses(verdict({ face: 8 }))).toBe(true);
    expect(verdictPasses(verdict({ face: 8, change: 6, same: 9 }))).toBe(false);
    expect(verdictPasses(null)).toBe(false);
  });

  it('keeps a model’s numbers between 0 and 10 and its problems to five', () => {
    const cleaned = cleanVerdict(
      verdict({
        recognisable: 14,
        anatomy: -2,
        face: Number.NaN,
        problems: [' a ', '', 'b', 'c', 'd', 'e', 'f'],
      }),
    );
    expect(cleaned.recognisable).toBe(10);
    expect(cleaned.anatomy).toBe(0);
    expect(cleaned.face).toBeNull();
    expect(cleaned.problems).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
