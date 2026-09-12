import { LIGHT_BELOW_WORDS, weightForPage } from './lecture';

describe('the budget a page gets', () => {
  it('follows the plan on a full page, and goes light when the page itself is sparse', () => {
    expect(weightForPage('full', 600)).toBe('full');
    expect(weightForPage('light', 600)).toBe('light');
    expect(weightForPage(undefined, 600)).toBe('full');
    // A slide: a heading and a few bullets.
    expect(weightForPage('full', 40)).toBe('light');
    expect(weightForPage(undefined, LIGHT_BELOW_WORDS - 1)).toBe('light');
    expect(weightForPage('full', LIGHT_BELOW_WORDS)).toBe('full');
    // No text at all is not a sparse page but an unknown one: the plan decides.
    expect(weightForPage('full', 0)).toBe('full');
  });
});
