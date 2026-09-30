import { COLD_OPEN_MS, coldOpen } from './studio-cold-open';

/**
 * The cold open (studio-explainer-plan, Ask 9, idea 13), held to by code:
 * what is missing only rides along on a send-back.
 */
describe('coldOpen', () => {
  const beat = (
    say: string,
    delivery: 'hook' | 'explain' | 'question' = 'explain',
  ) => ({ say, delivery });

  it('takes a question, a surprise or a situation in the opening seconds', () => {
    expect(
      coldOpen([beat('Where does the Sun go at night?', 'hook')], 150),
    ).toBeNull();
    expect(
      coldOpen(
        [beat('Your heart beats about a hundred thousand times every day!')],
        150,
      ),
    ).toBeNull();
    expect(
      coldOpen([beat('Imagine you drop a ball from a tall tower.')], 150),
    ).toBeNull();
    expect(
      coldOpen([beat('You wake up feeling hot and shivery.')], 150),
    ).toBeNull();
  });

  it('sends a definition that opens the film back to open on a hook, riding along', () => {
    const problem = coldOpen(
      [
        beat('Photosynthesis is the process by which green plants make food.'),
        beat('It takes place in the chloroplasts of the leaf cells.'),
        beat('It needs light, water and carbon dioxide from the air.'),
      ],
      150,
    );
    expect(problem).toMatchObject({
      rule: 'cold-open',
      level: 'warning',
      beat: 0,
    });
  });

  it(`looks only at what starts within ${COLD_OPEN_MS / 1000} seconds`, () => {
    const long =
      'Plants make food from light and water and air in their green leaves every single day of the year';
    // Two long sentences at a slow pace take the question past eight seconds.
    expect(
      coldOpen([beat(long), beat(long), beat('Can you guess how?')], 110),
    ).not.toBeNull();
    expect(
      coldOpen([beat('Plants make food.'), beat('Can you guess how?')], 110),
    ).toBeNull();
  });
});
