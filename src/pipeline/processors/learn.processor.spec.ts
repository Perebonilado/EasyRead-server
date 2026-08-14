import { sameHeading } from './learn.processor';

/**
 * The chapter title is printed by the typesetter, and the model usually
 * repeats it as the chapter's first heading. Catching that is what stops
 * every chapter opening with its own title twice.
 */
describe('sameHeading', () => {
  it('matches a heading the model numbered itself', () => {
    expect(
      sameHeading(
        '2. Key Players in the Krebs Cycle',
        'Key Players in the Krebs Cycle',
      ),
    ).toBe(true);
    expect(sameHeading('Chapter 3: Regulation', 'Regulation')).toBe(true);
  });

  it('ignores case, punctuation and spacing', () => {
    expect(sameHeading('the  KREBS cycle!', 'The Krebs Cycle')).toBe(true);
  });

  it('does not match two genuinely different chapters', () => {
    // The dangerous failure is the other way round: dropping a real heading
    // because it looked close enough.
    expect(
      sameHeading('Introduction to Cellular Respiration', 'Clinical Relevance'),
    ).toBe(false);
    expect(
      sameHeading('Regulation of the Krebs Cycle', 'Regulation of Glycolysis'),
    ).toBe(false);
  });
});
