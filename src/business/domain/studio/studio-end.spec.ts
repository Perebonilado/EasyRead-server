import { outlineOf } from './studio';
import { nextQuestionsOf } from './studio-end';

/**
 * How an explainer ends (studio-explainer-plan, Ask 9, idea 5): "What
 * next?" held to two or three short questions.
 */
describe('nextQuestionsOf', () => {
  it('keeps two or three short, distinct questions, each ending in a question mark', () => {
    expect(
      nextQuestionsOf(
        [
          '1. Why is it hot in summer',
          'Why is it hot in summer?',
          'Why does the Moon change shape?',
          'x'.repeat(120),
          'What if the Earth stopped spinning?',
          'One too many?',
        ],
        'Day and night',
      ),
    ).toEqual([
      'Why is it hot in summer?',
      'Why does the Moon change shape?',
      'What if the Earth stopped spinning?',
    ]);
  });

  it('keeps none for fewer than two, or none said', () => {
    expect(nextQuestionsOf(['Why?'])).toEqual([]);
    expect(nextQuestionsOf(undefined)).toEqual([]);
  });

  it('is read with the outline, and absent for a story', () => {
    expect(
      outlineOf({ title: 'A', scenes: [], next: ['Why a?', 'Why b?'] }).next,
    ).toEqual(['Why a?', 'Why b?']);
    expect(
      outlineOf({ title: 'A', scenes: [], next: [] }).next,
    ).toBeUndefined();
  });
});
