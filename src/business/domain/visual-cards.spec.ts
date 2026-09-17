import { layoutProblems, repairVisual, visualProblems } from './visual';
import {
  layoutTutorial,
  tidyTutorial,
  tutorialProblems,
  tutorialWarnings,
  type VisualTutorial,
} from './visual-cards';

const sentences = [
  'Plants make their own food, and the way they do it is called photosynthesis, which this chapter explains.',
  'It happens inside the leaf, in tiny green structures called chloroplasts, which sit inside every cell.',
  'A leaf takes in three things: sunlight, carbon dioxide from the air, and water from the roots below.',
  'Each one matters, so keep all three in mind as we go through the rest of the lesson together.',
  'The steps run in order: light comes in, water splits, and sugar is built from the parts.',
  'So in one line, carbon dioxide plus water plus light becomes glucose and oxygen for the plant.',
  'The leaf is the centre of it all, taking in three things and giving out two things we need.',
  'The thing to remember is that the leaf feeds the whole plant, from the roots to the flowers.',
  'That is photosynthesis, and now you know where the food of every plant on earth comes from.',
];

const tutorial: VisualTutorial = {
  title: 'How photosynthesis works',
  sentences,
  moments: [
    {
      from: 0,
      to: 0,
      card: 'title',
      eyebrow: 'chapter one',
      heading: 'How photosynthesis works',
    },
    {
      from: 1,
      to: 1,
      card: 'picture',
      picture: 'leaf',
      name: 'leaf',
      bubble: 'Sunlight in, sugar out.',
    },
    {
      from: 2,
      to: 3,
      card: 'chips',
      heading: 'What a leaf takes in',
      items: [
        { text: 'sunlight', picture: 'sun' },
        { text: 'CO2' },
        { text: 'water', picture: 'drop' },
      ],
      reveals: [
        { part: 1, sentence: 2, word: 8 },
        { part: 2, sentence: 2, word: 13 },
      ],
    },
    {
      from: 4,
      to: 4,
      card: 'flow',
      items: [
        { text: 'light in' },
        { text: 'water splits' },
        { text: 'sugar built' },
      ],
    },
    {
      from: 5,
      to: 5,
      card: 'number',
      figure: '3',
      caption: 'things in, two things out',
      bar: { value: 0.6, markers: [{ at: 0.6, text: '3' }] },
    },
    {
      from: 6,
      to: 6,
      card: 'hub',
      centre: { text: 'leaf', picture: 'leaf' },
      inputs: [
        { text: 'sunlight', picture: 'sun' },
        { text: 'CO2' },
        { text: 'water' },
      ],
      outputs: [{ text: 'glucose' }, { text: 'O2' }],
    },
    {
      from: 7,
      to: 8,
      card: 'statement',
      text: 'The leaf feeds the whole plant.',
      emphasis: ['whole', 'plant'],
    },
  ],
};

describe('a visual tutorial', () => {
  it('lays every card out with nothing overlapping and every part shown', () => {
    const script = repairVisual(layoutTutorial(tutorial));
    expect(tutorialProblems(tutorial, null)).toEqual([]);
    expect(visualProblems(script, null)).toEqual([]);
    expect(layoutProblems(script)).toEqual([]);
    expect(script.segments).toHaveLength(sentences.length);
  });

  it('brings a card in on its first word, reveals parts on their words, and clears for the next', () => {
    const script = layoutTutorial(tutorial);
    const chips = script.segments[2].cues;
    expect(chips.filter((c) => c.do === 'clear')).toHaveLength(1);
    expect(chips.find((c) => c.target === 'm2_p0')?.at).toBe(0);
    expect(chips.find((c) => c.target === 'm2_p1')?.at).toBe(8);
    expect(chips.find((c) => c.target === 'm2_p2')?.at).toBe(13);
    // The picture card's name comes with the picture, and the first moment clears nothing.
    expect(script.segments[1].cues.map((c) => c.target)).toEqual(
      expect.arrayContaining(['m1_c', 'm1_c_name', 'm1_s']),
    );
    expect(script.segments[0].cues.some((c) => c.do === 'clear')).toBe(false);
    // A hub's arrows come with the card.
    expect(
      script.segments[6].cues.filter((c) => c.target.startsWith('m5_a')),
    ).toHaveLength(5);
  });

  it('names what is wrong with a tutorial in the model’s own terms', () => {
    const broken: VisualTutorial = {
      ...tutorial,
      moments: [
        {
          from: 0,
          to: 2,
          card: 'title',
          heading: 'A heading that runs on far too long for the top of a card',
        },
        {
          from: 4,
          to: 4,
          card: 'chips',
          items: [{ text: 'one', picture: 'unicorn' }],
        },
        {
          from: 5,
          to: 8,
          card: 'statement',
          text: 'This statement goes on and on and on and on and on and on and on and on and on.',
        },
      ],
    };
    const problems = tutorialProblems(broken, null);
    expect(tutorialWarnings(broken)).toEqual([
      expect.stringContaining('no drawing was found for "unicorn"'),
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('the heading is'),
        expect.stringContaining('has from 4'),
        expect.stringContaining('between 2 and 5'),
        expect.stringContaining('the statement is'),
      ]),
    );
  });

  it('puts a range that runs one past the end, or into the moment before, right before checking', () => {
    const slipped: VisualTutorial = {
      ...tutorial,
      moments: [
        { from: 0, to: 3, card: 'title', heading: 'One' },
        { from: 3, to: 6, card: 'statement', text: 'Two things.' },
        { from: 7, to: 9, card: 'statement', text: 'Three things.' },
      ],
    };
    const tidy = tidyTutorial(slipped);
    expect(tidy.moments.map((m) => [m.from, m.to])).toEqual([
      [0, 3],
      [4, 6],
      [7, 8],
    ]);
    // A moment past the last sentence has nothing to cover, and goes.
    const past = tidyTutorial({
      ...tutorial,
      moments: [
        { from: 0, to: 8, card: 'title', heading: 'One' },
        { from: 9, to: 9, card: 'statement', text: 'Two things.' },
      ],
    });
    expect(past.moments).toHaveLength(1);
    // A bare closing sentence goes to the last card; a reveal outside its moment lands on its edge.
    const bare = tidyTutorial({
      ...tutorial,
      moments: [
        { from: 0, to: 3, card: 'title', heading: 'One' },
        {
          from: 4,
          to: 6,
          card: 'list',
          items: [{ text: 'a' }, { text: 'b' }],
          reveals: [{ part: 1, sentence: 8, word: 2 }],
        },
      ],
    });
    expect(bare.moments[1].to).toBe(8);
    expect(bare.moments[1].reveals?.[0].sentence).toBe(8);
  });
});
