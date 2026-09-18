import {
  MECHANISM_KINDS,
  mechanismProblems,
  tidyMechanism,
} from './visual-mechanisms';

describe('a mechanism as the app runs it', () => {
  it('keeps the numbers the page gives, clamps the rest, and counts what it assumed', () => {
    const mech = tidyMechanism(
      {
        kind: 'bucket',
        params: { capacity: 10, rate: 99 },
        phases: [
          { stage: 'serve', text: 'requests take one' },
          { stage: 'fill', text: 'tokens drip in' },
          { stage: 'fill', text: 'again' },
          { stage: 'nonsense', text: 'no' },
        ],
      },
      null,
    );
    expect(mech.params.capacity).toBe(10);
    expect(mech.params.rate).toBe(10);
    expect(mech.assumed).toEqual(['requests', 'perRequest']);
    expect(mech.stages).toEqual(['fill', 'serve']);
    expect(mech.texts).toEqual(['tokens drip in', 'requests take one']);
  });

  it('falls back to the first stage when none is asked, and to defaults when a number is not on the page', () => {
    const mech = tidyMechanism(
      { kind: 'queue', params: { arrivals: 7 } },
      (value) => value !== 7,
    );
    expect(mech.stages).toEqual(['steady']);
    expect(mech.params.arrivals).toBe(2);
    expect(mech.assumed).toContain('arrivals');
  });

  it('names what is wrong in the model’s own terms', () => {
    expect(mechanismProblems(undefined, 'Moment 1')).toHaveLength(1);
    const problems = mechanismProblems(
      {
        kind: 'pump',
        params: { beats: 60 },
        phases: [{ stage: 'refuse', text: 'x' }],
      },
      'Moment 2',
    );
    expect(problems.join(' ')).toContain('no stage "refuse"');
    expect(MECHANISM_KINDS).toHaveLength(7);
  });
});
