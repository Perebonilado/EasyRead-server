import {
  assembleTutorial,
  cutShort,
  mergeDecisions,
  tidyNarration,
  momentsNamed,
  plainMoment,
  tidyTutorial,
  tutorialProblems,
  type VisualDecisions,
  type VisualNarration,
} from './visual-cards';
import { buildMenu } from './visual-menu';
import { STAGES, repairVisual } from './visual';
import { layoutTutorial } from './visual-cards';
import { renderFilm } from './visual-render';

const narration: VisualNarration = {
  title: 'The tsetse fly',
  fit: 'good',
  fitReason: null,
  sentences: [
    'The tsetse fly bites people and cattle to feed on blood, and that is where this page begins.',
    'Its proboscis pushes through the skin, and its wings fold flat over its back when it rests.',
    'Traps and screens cut the numbers of flies where cattle graze, and that is the second idea.',
    'A token bucket, by contrast, is a machine: tokens drip in at a rate and requests take them.',
    'When the bucket is empty the request waits, and that is how a burst of requests is held back.',
    'Those are the two pictures of this page, and now you know both of them.',
  ],
  moments: [
    { from: 0, to: 1, intent: 'the fly and how it feeds' },
    { from: 2, to: 2, intent: 'what cuts the fly numbers' },
    { from: 3, to: 4, intent: 'how a token bucket fills and empties' },
    { from: 5, to: 5, intent: 'the two pictures' },
  ],
};

const decisions: VisualDecisions = {
  moments: [
    {
      index: 0,
      reasoning: 'A living thing with a named part.',
      shouldSee: 'A fly with a line to its proboscis.',
      confidence: 'high',
      card: 'picture',
      picture: 'tsetse fly',
      name: 'tsetse fly',
      callouts: [{ part: 'proboscis', text: 'pushes through skin' }],
    },
    {
      index: 1,
      reasoning: 'A set of things.',
      shouldSee: 'Two chips.',
      confidence: 'high',
      card: 'chips',
      heading: 'What cuts the numbers',
      items: [{ text: 'traps' }, { text: 'screens' }],
    },
    {
      index: 2,
      reasoning: 'A process over time.',
      shouldSee: 'A bucket filling and draining.',
      confidence: 'high',
      card: 'mechanism',
      mechanism: {
        kind: 'bucket',
        phases: [
          { stage: 'fill', text: 'tokens drip in' },
          { stage: 'serve', text: 'requests take one' },
        ],
      },
      reveals: [
        { part: 0, sentence: 3 },
        { part: 1, sentence: 4 },
      ],
    },
  ],
};

describe('the director’s decisions as a tutorial', () => {
  it('assembles narration and decisions, and ships a moment with no decision plain', () => {
    const tutorial = assembleTutorial(narration, decisions);
    expect(tutorial.moments).toHaveLength(4);
    expect(tutorial.moments[0]).toMatchObject({
      from: 0,
      to: 1,
      card: 'picture',
      index: 0,
      intent: 'the fly and how it feeds',
    });
    expect(tutorial.moments[2]).toMatchObject({ card: 'mechanism', index: 2 });
    expect(tutorial.moments[3]).toMatchObject({
      card: 'statement',
      plain: true,
      text: 'the two pictures',
    });
    // The fixture's narration is short on purpose; no card is at fault.
    expect(
      tutorialProblems(tidyTutorial(tutorial), null).filter((p) =>
        p.startsWith('Moment'),
      ),
    ).toEqual([]);
  });

  it('merges a redo into the decisions it replaces and nothing else', () => {
    const merged = mergeDecisions(
      decisions,
      {
        moments: [
          {
            ...decisions.moments[1],
            card: 'list',
            items: [{ text: 'traps' }, { text: 'screens' }, { text: 'dips' }],
          },
        ],
      },
      [1],
    );
    expect(merged.moments.map((d) => d.index)).toEqual([0, 1, 2]);
    expect(merged.moments[1].card).toBe('list');
    expect(merged.moments[0].card).toBe('picture');
  });

  it('reads which moments the problems name, by position', () => {
    expect(
      momentsNamed([
        'Moment 3 (chips): item 1 is too long.',
        '"m0_c" runs outside the canvas margin.',
        'The narration is 5 sentences; between 8 and 48.',
      ]),
    ).toEqual([0, 2]);
    expect(
      plainMoment(1, 2, 'a b c d e f g h i j k l m n o p', 4),
    ).toMatchObject({ card: 'statement', plain: true, index: 4 });
  });

  it('builds a menu that names what will draw for the page', () => {
    const menu = buildMenu(
      'Tsetse flies bite cattle near the traps by the village clinic.',
      narration.sentences,
    );
    expect(menu.text).toContain('tsetse');
    expect(menu.text).toContain('insect');
    expect(menu.text).toContain('proboscis');
    expect(menu.figures.some((line) => line.includes('quadruped'))).toBe(true);
    expect(menu.text).toContain('MECHANISMS');
    expect(menu.text).toContain('bucket');
    expect(menu.text.length).toBeLessThan(9000);
  });

  it('renders a filmstrip with three frames per moment, for all moments or a few', () => {
    const tutorial = tidyTutorial(assembleTutorial(narration, decisions));
    const script = repairVisual(
      layoutTutorial(tutorial, STAGES.box),
      STAGES.box,
    );
    const all = renderFilm(script, tutorial.moments, { w: 360, h: 270 });
    expect((all.match(/stroke="#3B4560"/g) ?? []).length).toBe(
      tutorial.moments.length * 3,
    );
    const some = renderFilm(script, tutorial.moments, { w: 360, h: 270 }, [2]);
    expect((some.match(/stroke="#3B4560"/g) ?? []).length).toBe(3);
    expect(some).toContain('>3<');
  });
});

describe('tidying what the models wrote', () => {
  it('cuts an over-long sentence and moves the moments along', () => {
    const long = Array.from({ length: 41 }, (_, i) =>
      i === 19 ? 'rate,' : `w${i}`,
    ).join(' ');
    const tidy = tidyNarration({
      ...narration,
      sentences: [narration.sentences[0], long, narration.sentences[2]],
      moments: [
        { from: 0, to: 0, intent: 'a' },
        { from: 1, to: 1, intent: 'b' },
        { from: 2, to: 2, intent: 'c' },
      ],
    });
    expect(tidy.sentences).toHaveLength(4);
    expect(tidy.sentences[1].split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(tidy.moments).toEqual([
      { from: 0, to: 0, intent: 'a' },
      { from: 1, to: 2, intent: 'b' },
      { from: 3, to: 3, intent: 'c' },
    ]);
  });

  it('collapses line breaks in card text before checking it', () => {
    const tutorial = tidyTutorial(
      assembleTutorial(narration, {
        moments: [
          {
            ...decisions.moments[1],
            items: [{ text: 'Third-party API\ngateway' }, { text: 'screens' }],
          },
        ],
      }),
    );
    expect(tutorial.moments[1].items?.[0].text).toBe('Third-party API gateway');
  });

  it('does not take a whole word for a cut one', () => {
    const pool = new Set(['memory', 'used', 'gateway', 'second']);
    expect(cutShort('Efficient memory use', pool)).toBe(false);
    expect(cutShort('Pick among only the', pool)).toBe(false);
    expect(cutShort('Third-party API gatewa', pool)).toBe(true);
  });
});
