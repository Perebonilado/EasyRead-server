import { screenTalk, screenTalkIn } from './studio-screen-talk';

describe('an explainer voice that talks about the screen', () => {
  it.each([
    ['On the left is a sad face, and on the right a happy one.', 'On the left'],
    [
      'The happy face on the right shows a child who feels safe.',
      'on the right',
    ],
    ['At the top, you see the heart.', 'At the top'],
    ['Look at the bottom left corner.', 'at the bottom left'],
    ['As you can see, the cells divide.', 'As you can see'],
    ['Here we see the water rising.', 'Here we see'],
    ['In this diagram, the arrows show the blood flow.', 'In this diagram'],
    ['This picture shows the lungs.', 'This picture shows'],
    ['On the left-hand side sits the nucleus.', 'On the left'],
  ])('finds it in "%s"', (say, words) => {
    expect(screenTalk(say)).toBe(words);
  });

  it.each([
    'A child who feels safe at home is less likely to take risks.',
    'Trained cells fight back fast; unprepared ones are slow.',
    'She is on the right track.',
    'The bus left at noon, and he turned right at the corner.',
    'Drive on the left of the road in some countries.',
    'Tigers sit at the top of the food chain.',
    'The right answer is twelve.',
  ])('leaves "%s" alone', (say) => {
    expect(screenTalk(say)).toBeNull();
  });

  it('names each line that does, by its place', () => {
    expect(
      screenTalkIn([
        { say: 'Why do some children cope better than others?' },
        { say: 'On the left is a sad face.' },
        { say: 'Support at home makes the difference.' },
        { say: 'As you can see, it works.' },
      ]),
    ).toEqual([
      { beat: 1, words: 'On the left' },
      { beat: 3, words: 'As you can see' },
    ]);
  });
});
