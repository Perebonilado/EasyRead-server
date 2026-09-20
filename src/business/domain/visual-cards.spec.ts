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
    // A hub's arrows draw with their inputs and outputs, each on the word
    // that names it, and run their beads from there.
    const arrows = script.segments[6].cues.filter((c) =>
      c.target.startsWith('m5_a'),
    );
    expect(arrows.filter((c) => c.do === 'draw')).toHaveLength(5);
    expect(arrows.filter((c) => c.do === 'flow')).toHaveLength(5);
    expect(arrows.some((c) => c.at > 0)).toBe(true);
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
        {
          from: 7,
          to: 9,
          card: 'list',
          items: [{ text: 'three' }, { text: 'things' }],
        },
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

describe('the order parts come in', () => {
  const lines = [
    'The network has three layers, and each one hands its work to the next.',
    'The input layer feeds the hidden layer, which feeds the output layer.',
    'Keep the order in mind, because the answer comes out at the end.',
    'That is the whole shape of it, and the rest of the page fills it in.',
    'One more line here, so that the narration is long enough to hold.',
  ];
  const cuesFor = (t: VisualTutorial) =>
    layoutTutorial(t)
      .segments.flatMap((s, i) =>
        s.cues.map((c) => ({ sentence: i, at: c.at, target: c.target })),
      )
      .filter((c) => c.target.startsWith('m0_p'));
  const base: VisualTutorial = {
    title: 'Layers',
    sentences: lines,
    moments: [
      {
        from: 0,
        to: 4,
        card: 'list',
        heading: 'Three layers',
        items: [
          { text: 'Input layer' },
          { text: 'Hidden layer' },
          { text: 'Output layer' },
        ],
        reveals: [
          { part: 0, sentence: 1 },
          { part: 1, sentence: 1 },
          { part: 2, sentence: 1 },
        ],
      },
    ],
  };

  it('finds each part on the word that is its own, not the word they share', () => {
    const cues = cuesFor(base);
    expect(cues.find((c) => c.target === 'm0_p0')?.at).toBe(1);
    expect(cues.find((c) => c.target === 'm0_p1')?.at).toBe(5);
    expect(cues.find((c) => c.target === 'm0_p2')?.at).toBe(10);
  });

  it('never shows a later part before an earlier one, whatever the model said', () => {
    const cues = cuesFor({
      ...base,
      moments: [
        {
          ...base.moments[0],
          reveals: [
            { part: 0, sentence: 2 },
            { part: 1, sentence: 1 },
            { part: 2, sentence: 1 },
          ],
        },
      ],
    });
    const beat = (id: string) => {
      const c = cues.find((cue) => cue.target === id)!;
      return c.sentence * 1000 + c.at;
    };
    expect(beat('m0_p0')).toBeLessThan(beat('m0_p1'));
    expect(beat('m0_p1')).toBeLessThan(beat('m0_p2'));
    expect(tutorialWarnings(base).join(' ')).not.toContain('order');
    expect(
      tutorialWarnings({
        ...base,
        moments: [
          {
            ...base.moments[0],
            reveals: [
              { part: 0, sentence: 2 },
              { part: 1, sentence: 1 },
            ],
          },
        ],
      }).join(' '),
    ).toContain('order');
  });

  it('fills in the parts the model left out, after the ones it revealed', () => {
    const cues = cuesFor({
      ...base,
      moments: [
        {
          ...base.moments[0],
          items: [
            { text: 'Input layer' },
            { text: 'Hidden layer' },
            { text: 'Output layer' },
            { text: 'Loss' },
          ],
          reveals: [{ part: 0, sentence: 1 }],
        },
      ],
    });
    const beat = (id: string) => {
      const c = cues.find((cue) => cue.target === id)!;
      return c.sentence * 1000 + c.at;
    };
    // The revealed part on its word; the rest on their own words after it, and the unnamed one later still.
    expect(cues.find((c) => c.target === 'm0_p0')).toEqual({
      sentence: 1,
      at: 1,
      target: 'm0_p0',
    });
    expect(beat('m0_p1')).toBe(1005);
    expect(beat('m0_p2')).toBe(1010);
    expect(beat('m0_p3')).toBeGreaterThan(1010);
  });
});

describe('a card that holds the stage', () => {
  /** The leaf drawn once, named across three moments, with the line to remember over it. */
  const held: VisualTutorial = {
    ...tutorial,
    moments: [
      {
        from: 0,
        to: 1,
        card: 'picture',
        picture: 'leaf',
        name: 'leaf',
        callouts: [
          { part: 'sunlight', text: 'comes in' },
          { part: 'water', text: 'rises' },
        ],
      },
      {
        from: 2,
        to: 3,
        card: 'picture',
        continues: true,
        picture: 'leaf',
        name: 'leaf',
        callouts: [
          { part: 'sunlight', text: 'comes in' },
          { part: 'water', text: 'rises' },
        ],
      },
      {
        from: 4,
        to: 5,
        card: 'statement',
        continues: true,
        text: 'The leaf feeds the whole plant.',
        emphasis: ['whole'],
      },
      {
        from: 6,
        to: 8,
        card: 'picture',
        continues: true,
        picture: 'leaf',
        name: 'leaf',
        callouts: [
          { part: 'sunlight', text: 'comes in' },
          { part: 'water', text: 'rises' },
        ],
      },
    ],
  };

  it('lays it once, clears nothing after the first moment, and keeps its ids', () => {
    const script = layoutTutorial(held);
    const clears = script.segments.flatMap((s) =>
      s.cues.filter((c) => c.do === 'clear'),
    );
    expect(clears).toHaveLength(0);
    // Every part belongs to the moment that laid the card, not the ones after it.
    const drawn = new Set(script.elements.map((e) => e.id.replace(/_.*$/, '')));
    expect([...drawn].sort()).toEqual(['m0', 'm2']);
  });

  it('dims the held card under the card laid over it and lights it again after', () => {
    const script = layoutTutorial(held);
    const dims = script.segments[4].cues.filter((c) => c.do === 'dim');
    expect(dims.length).toBeGreaterThan(0);
    expect(dims.every((c) => c.target.startsWith('m0'))).toBe(true);
    // The statement takes the stage over it.
    expect(
      script.segments[4].cues.some(
        (c) =>
          c.target.startsWith('m2') && (c.do === 'fade' || c.do === 'draw'),
      ),
    ).toBe(true);
    // The picture comes back when the run carries on, and the statement goes.
    const back = script.segments[6].cues;
    expect(
      back.some((c) => c.do === 'undim' && c.target.startsWith('m0')),
    ).toBe(true);
    expect(back.some((c) => c.do === 'hide' && c.target.startsWith('m2'))).toBe(
      true,
    );
  });

  it('closes on a frame that lights the whole stage', () => {
    const script = layoutTutorial(held);
    const last = script.segments[script.segments.length - 1].cues;
    expect(last.some((c) => c.do === 'undim' && c.target === '*')).toBe(true);
  });

  it('stays sound, and the held card is not weighed against what sits over it', () => {
    const script = repairVisual(layoutTutorial(held));
    expect(tutorialProblems(held, null)).toEqual([]);
    expect(visualProblems(script, null)).toEqual([]);
    expect(layoutProblems(script)).toEqual([]);
  });

  it('settles what keeps the stage: the first moment, a title and a plain card start afresh', () => {
    const tidy = tidyTutorial({
      ...held,
      moments: [
        { ...held.moments[0], continues: true },
        held.moments[1],
        { ...held.moments[2], plain: true },
        { ...held.moments[3], card: 'title', heading: 'Next' },
      ],
    });
    expect(tidy.moments.map((m) => Boolean(m.continues))).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });
});

describe('a shape a card claims', () => {
  const card = (
    name: string,
    outline: 'vessel' | 'blob' | 'layers',
    looksLike?: string,
  ): VisualTutorial => ({
    ...tutorial,
    moments: [
      { from: 0, to: 2, card: 'title', heading: 'One' },
      { from: 3, to: 5, card: 'statement', text: 'A line to remember.' },
      {
        from: 6,
        to: 8,
        card: 'picture',
        picture: name,
        name,
        shape: { outline, parts: [], manner: 'still' },
        ...(looksLike ? { looksLike } : {}),
      },
    ],
  });
  /** Only what the check says about the shape, not the rest of the fixture. */
  const shapeProblems = (t: VisualTutorial) =>
    tutorialProblems(t, null).filter(
      (p) => p.includes('looks like') || p.includes('which is not a'),
    );

  it('refuses a shape with nothing said about what the thing looks like', () => {
    expect(shapeProblems(card('kidney', 'vessel'))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('does not say what "kidney" looks like'),
      ]),
    );
  });

  it('refuses a shape the thing’s own description does not bear out', () => {
    const problems = shapeProblems(
      card(
        'kidney',
        'vessel',
        'a bean-shaped organ with a notch on the inner edge',
      ),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('which is not a vessel'),
      ]),
    );
    // The reason names the shape, so the director can choose again.
    expect(problems.join(' ')).toContain('a tall open box seen from the side');
  });

  it('takes the shape the description does bear out', () => {
    expect(
      shapeProblems(
        card(
          'kidney',
          'blob',
          'a bean-shaped organ with a smooth rounded edge',
        ),
      ),
    ).toEqual([]);
    expect(
      shapeProblems(
        card('shale', 'layers', 'bands of rock lying one on another'),
      ),
    ).toEqual([]);
  });

  it('is not fooled by what the thing does', () => {
    // The job words are the trap: a kidney filters, a tank holds.
    const byJob = shapeProblems(
      card(
        'kidney',
        'vessel',
        'an organ that filters the blood and holds fluid',
      ),
    );
    expect(byJob).toEqual(
      expect.arrayContaining([
        expect.stringContaining('which is not a vessel'),
      ]),
    );
    const byForm = shapeProblems(
      card(
        'water tank',
        'vessel',
        'a tall open box with a level line across it',
      ),
    );
    expect(byForm).toEqual([]);
  });
});

describe('a picture that stands for an idea', () => {
  const lesson = (
    said: string,
    standsFor: string,
    picture: string,
  ): VisualTutorial => ({
    title: 'Prices',
    sentences: [
      'Prices do not stay still, and this chapter is about why they rise.',
      'When money loses value over time, we call that inflation.',
      said,
      'Wages that do not keep up leave people poorer than they were.',
      'Central banks raise rates to slow it down again.',
      'That is inflation, and now you know what makes it happen.',
    ],
    moments: [
      { from: 0, to: 1, card: 'title', heading: 'Prices' },
      {
        from: 2,
        to: 3,
        card: 'picture',
        picture,
        name: 'inflation',
        standsFor,
      },
      { from: 4, to: 5, card: 'statement', text: 'Rates slow it down.' },
    ],
  });
  const said = (t: VisualTutorial) =>
    tutorialProblems(t, null).filter((p) => p.includes('stands for'));

  it('takes a comparison the voice makes', () => {
    expect(
      said(
        lesson(
          'Think of inflation as a balloon that keeps filling with air.',
          'inflation',
          'balloon',
        ),
      ),
    ).toEqual([]);
  });

  it('refuses a comparison the voice never makes', () => {
    expect(
      said(
        lesson(
          'Inflation means money buys less each year than it did before.',
          'inflation',
          'balloon',
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('never mention "balloon"'),
      ]),
    );
  });

  it('refuses one whose idea the sentences never name', () => {
    expect(
      said(
        lesson(
          'Think of it as a balloon that keeps filling with air.',
          'quantitative easing',
          'balloon',
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('these sentences never say it'),
      ]),
    );
  });
});
